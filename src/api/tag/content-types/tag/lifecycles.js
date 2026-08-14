const { emitToUser } = require("../../../../utils/socket");

function collectOwnerIds(tag) {
  const owners = [...(tag.projects || []), ...(tag.fundings || [])]
    .map((entry) => entry.owner && entry.owner.id)
    .filter(Boolean);
  return [...new Set(owners)];
}

async function notifyOwnersOfDecision({ title, decision, tagId, ownerIds }) {
  for (const ownerId of ownerIds) {
    if (tagId) {
      // Guards against a concurrent double-approve (two requests both observing
      // the pending -> approved transition) double-notifying the same owner.
      const alreadyNotified = await strapi.entityService.findMany(
        "api::tag-decision.tag-decision",
        { filters: { tag: tagId, decision, submittedBy: ownerId } }
      );
      if (alreadyNotified.length > 0) continue;
    }

    await strapi.entityService.create("api::tag-decision.tag-decision", {
      data: { title, decision, tag: tagId || null, submittedBy: ownerId },
    });

    const owner = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      ownerId,
      {
        fields: ["email"],
        populate: {
          user_detail: { populate: { notifications: { populate: { email: "*", app: "*" } } } },
        },
      }
    );
    if (!owner || !owner.user_detail) continue;

    const subject =
      decision === "approved"
        ? `Ihr vorgeschlagenes Schlagwort wurde genehmigt`
        : `Ihr vorgeschlagenes Schlagwort wurde abgelehnt`;
    const html = `Das von Ihnen vorgeschlagene Schlagwort "${title}" wurde ${decision === "approved" ? "genehmigt" : "abgelehnt"
      }.`;

    if (owner.user_detail.notifications.email.tagReviewDecision == true) {
      strapi.plugins["email"].services.email.send({
        to: owner.email,
        from: process.env.DEF_FROM,
        replyTo: process.env.DEF_FROM,
        subject,
        html,
      });
    }
    if (owner.user_detail.notifications.app.tagReviewDecision == true) {
      emitToUser(ownerId, "notification", { type: "tagReviewDecision" });
    }
  }
}

const TAG_OWNER_POPULATE = {
  fields: ["title", "status"],
  populate: {
    projects: { populate: { owner: { fields: ["id"] } } },
    fundings: { populate: { owner: { fields: ["id"] } } },
  },
};

module.exports = {
  async afterCreate(event) {
    const { params, result } = event;
    if (params.data.status !== "pending") return;

    const admins = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        fields: ["username", "email"],
        populate: {
          role: { fields: ["type"] },
          user_detail: {
            populate: { notifications: { populate: { email: "*", app: "*" } } },
          },
        },
        filters: {
          role: { type: "admin" },
        },
      }
    );

    for (const admin of admins) {
      if (!admin.user_detail) continue;
      if (admin.user_detail.notifications.email.tagPendingApproval == true) {
        strapi.plugins["email"].services.email.send({
          to: admin.email,
          from: process.env.DEF_FROM,
          replyTo: process.env.DEF_FROM,
          subject: `Ein neues Schlagwort wartet auf Genehmigung`,
          html: `Das Schlagwort "${result.title}" wurde von der KI-Vorschlagsfunktion vorgeschlagen und wartet auf Genehmigung.`,
        });
      }
      if (admin.user_detail.notifications.app.tagPendingApproval == true) {
        emitToUser(admin.id, "notification", { type: "tagPendingApproval" });
      }
    }
  },

  async beforeUpdate(event) {
    event.state.previousTag = await strapi.entityService.findOne(
      "api::tag.tag",
      event.params.where.id,
      TAG_OWNER_POPULATE
    );
  },

  async afterUpdate(event) {
    const prev = event.state.previousTag;
    if (!prev || prev.status !== "pending" || event.result.status !== "approved") return;

    await notifyOwnersOfDecision({
      title: prev.title,
      decision: "approved",
      tagId: event.result.id,
      ownerIds: collectOwnerIds(prev),
    });
  },

  async beforeDelete(event) {
    event.state.deletedTag = await strapi.entityService.findOne(
      "api::tag.tag",
      event.params.where.id,
      TAG_OWNER_POPULATE
    );
  },

  async afterDelete(event) {
    const deleted = event.state.deletedTag;
    if (!deleted || deleted.status !== "pending") return;

    await notifyOwnersOfDecision({
      title: deleted.title,
      decision: "rejected",
      tagId: null,
      ownerIds: collectOwnerIds(deleted),
    });
  },

  // Content Manager's multi-select "Delete" action goes through deleteMany,
  // not delete - covered separately so bulk-rejecting pending tags there also
  // notifies owners.
  async beforeDeleteMany(event) {
    event.state.deletedTags = await strapi.entityService.findMany("api::tag.tag", {
      ...TAG_OWNER_POPULATE,
      filters: event.params.filters,
    });
  },

  async afterDeleteMany(event) {
    const deletedTags = event.state.deletedTags || [];
    for (const deleted of deletedTags.filter((t) => t.status === "pending")) {
      await notifyOwnersOfDecision({
        title: deleted.title,
        decision: "rejected",
        tagId: null,
        ownerIds: collectOwnerIds(deleted),
      });
    }
  },
};
