"use strict";

const crypto = require("crypto");
const { resolveRecipientContact, guidelineNameOf, fetchProjectForRecipient } = require("../../recipient.js");
const { buildVorpruefungEmail } = require("../../email.js");

// NOTE: Strapi validates this module's exports against the known lifecycle hook
// names and refuses to boot on anything else, so the shared recipient helpers
// live in `src/api/vorpruefung-ticket/recipient.js` instead of being re-exported
// from here.
module.exports = {
  async afterCreate(event) {
    const { result, params } = event;

    // An admin override records the decision directly; nobody is asked.
    if (params?.data?.overriddenAt) {
      return;
    }

    const rawProjectId = params?.data?.project;
    const projectId = (rawProjectId && rawProjectId.id) || rawProjectId;
    if (!projectId) {
      return;
    }

    const project = await fetchProjectForRecipient(projectId);
    if (!project) {
      return;
    }

    const contact = resolveRecipientContact(result.type, project);
    if (!contact) {
      return;
    }

    // The wording depends on whether this recipient has answered a previous
    // attempt. A different address means the reviewer changed (typically a new
    // funding provider), so they must not be told about a decision that was
    // never theirs.
    const priorRows = await strapi.entityService.findMany(
      "api::vorpruefung-ticket.vorpruefung-ticket",
      {
        filters: {
          project: projectId,
          type: result.type,
          supersededAt: { $notNull: true },
          answeredAt: { $notNull: true },
        },
        fields: ["id", "reviewerContact"],
        sort: [{ id: "desc" }],
        limit: 1,
      }
    );
    const prior = priorRows[0];
    const variant =
      prior && prior.reviewerContact?.trim().toLowerCase() === contact.email?.trim().toLowerCase()
        ? "reAsk"
        : "initial";

    const token = crypto.randomUUID();
    const sentAt = new Date();
    const tokenExpiresAt = new Date(sentAt);
    tokenExpiresAt.setMonth(tokenExpiresAt.getMonth() + 2);

    await strapi.entityService.update(
      "api::vorpruefung-ticket.vorpruefung-ticket",
      result.id,
      {
        data: {
          token,
          sentAt,
          tokenExpiresAt,
          reviewerContact: contact.email,
          reviewerFirstName: contact.firstName,
          reviewerLastName: contact.lastName,
        },
      }
    );

    const { subject, html } = buildVorpruefungEmail({
      projectTitle: project.title,
      guidelineName: guidelineNameOf(project),
      type: result.type,
      token,
      variant,
      firstName: contact.firstName,
      lastName: contact.lastName,
    });

    await strapi.plugins["email"].services.email.send({
      to: contact.email,
      from: process.env.DEF_FROM,
      replyTo: process.env.DEF_FROM,
      subject,
      html,
    });
  },
};
