"use strict";

const { t } = require("../../../utils/i18n");
/**
 * vorpruefung-ticket controller
 */

const crypto = require("crypto");
const { createCoreController } = require("@strapi/strapi").factories;
const { resolveRecipientContact, guidelineNameOf, fetchProjectForRecipient } = require("../recipient.js");
const { buildVorpruefungEmail } = require("../email.js");
const { userCanAccessProject, userCanEditProject } = require("../access.js");
const { validateDecision } = require("../decision.js");

// Every field except `token` (private — the review-link secret) and the
// `project` relation itself (the FE already knows which project it asked
// for). Custom actions on this controller bypass Strapi's core `find`, so
// they don't get its automatic private-field stripping for free — this is
// the explicit substitute.
const SAFE_TICKET_FIELDS = [
  "id", "type", "notes", "status", "wantsPhoneCall", "wantsOnsiteMeeting",
  "suggestedDates", "responseText", "reviewerContact", "tokenExpiresAt",
  "sentAt", "answeredAt", "reminderSentAt", "createdAt", "updatedAt",
  "attempt", "supersededAt", "supersededReason", "overriddenAt",
];

const TICKET_TYPES = ["finanzen", "personal", "foerdermittelgeber"];

// `liveKey` carries a unique index and is set only while a row is live, so the
// database itself refuses a second live request for the same project and type
// (MySQL allows any number of NULLs, which is what retired rows hold).
function liveKeyFor(projectId, type) {
  return `${projectId}:${type}`;
}

function isUniqueViolation(error) {
  const cause = error && (error.cause || error.originalError || error);
  return (
    cause?.code === "ER_DUP_ENTRY" ||
    cause?.errno === 1062 ||
    /duplicate entry|unique constraint/i.test(String(error && error.message))
  );
}

async function nextAttempt(strapi, projectId, type) {
  const [latest] = await strapi.entityService.findMany(
    "api::vorpruefung-ticket.vorpruefung-ticket",
    {
      filters: { project: projectId, type },
      fields: ["attempt"],
      sort: [{ attempt: "desc" }],
      limit: 1,
    }
  );
  return ((latest && latest.attempt) || 0) + 1;
}

// Re-asserts "still pending" at write time (not just from the caller's read)
// so a genuine reviewer answer landing in between is never overwritten.
async function overridePending(strapi, ctx, ticketId, decision) {
  const now = new Date();
  const { count } = await strapi.db
    .query("api::vorpruefung-ticket.vorpruefung-ticket")
    .updateMany({
      where: { id: ticketId, answeredAt: null, supersededAt: null },
      data: { ...decision, answeredAt: now, overriddenAt: now },
    });

  if (count === 0) {
    return ctx.badRequest(t(ctx, "Diese Vorprüfung wurde bereits beantwortet."));
  }

  // The query-engine layer above drops relation attributes, so overriddenBy is
  // set separately once the row is claimed.
  await strapi.entityService.update(
    "api::vorpruefung-ticket.vorpruefung-ticket",
    ticketId,
    { data: { overriddenBy: ctx.state.user.id } }
  );

  return { success: true, id: ticketId };
}

async function overrideForProject(strapi, ctx) {
  const projectId = Number(ctx.request.body?.project);
  const type = ctx.request.body?.type;
  if (!Number.isInteger(projectId) || !TICKET_TYPES.includes(type)) {
    return ctx.badRequest(t(ctx, "Projekt und Typ sind erforderlich."));
  }

  const parsed = validateDecision(ctx.request.body);
  if (parsed.error) {
    return ctx.badRequest(t(ctx, parsed.error));
  }

  const project = await strapi.entityService.findOne("api::project.project", projectId, { fields: ["id"] });
  if (!project) {
    return ctx.badRequest(t(ctx, "Projekt nicht gefunden."));
  }

  const [live] = await strapi.entityService.findMany(
    "api::vorpruefung-ticket.vorpruefung-ticket",
    {
      filters: { project: projectId, type, supersededAt: { $null: true } },
      fields: ["id", "status", "answeredAt"],
      limit: 1,
    }
  );

  if (live && !live.answeredAt) {
    return overridePending(strapi, ctx, live.id, parsed.data);
  }
  if (live && live.status === "positiv") {
    return ctx.badRequest(t(ctx, "Diese Vorprüfung wurde bereits positiv beantwortet."));
  }

  // A declined or meeting-request answer stays in the history; the override
  // becomes the next attempt, exactly as a re-ask would.
  if (live) {
    const { count } = await strapi.db
      .query("api::vorpruefung-ticket.vorpruefung-ticket")
      .updateMany({
        where: { id: live.id, supersededAt: null },
        data: { supersededAt: new Date(), supersededReason: "override", liveKey: null },
      });
    if (count === 0) {
      return ctx.badRequest(t(ctx, "Diese Anfrage wurde bereits durch eine neuere ersetzt."));
    }
  }

  const now = new Date();
  let created;
  try {
    created = await strapi.entityService.create(
      "api::vorpruefung-ticket.vorpruefung-ticket",
      {
        data: {
          project: projectId,
          type,
          attempt: await nextAttempt(strapi, projectId, type),
          liveKey: liveKeyFor(projectId, type),
          ...parsed.data,
          answeredAt: now,
          overriddenAt: now,
          overriddenBy: ctx.state.user.id,
        },
      }
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return ctx.badRequest(t(ctx, "Für diese Vorprüfung läuft bereits eine Anfrage."));
    }
    throw error;
  }

  return { success: true, id: created.id };
}

function stripPrivate(ticket) {
  const { token: _token, liveKey: _liveKey, ...safe } = ticket;
  return safe;
}

module.exports = createCoreController(
  "api::vorpruefung-ticket.vorpruefung-ticket",
  ({ strapi }) => ({
    async find(ctx) {
      const rawProjectId = ctx.query?.filters?.project;
      const projectId = Number(rawProjectId);
      if (!rawProjectId || !Number.isInteger(projectId)) {
        return ctx.badRequest(t(ctx, "Projekt-ID fehlt oder ist ungültig."));
      }

      const canAccess = await userCanAccessProject(strapi, ctx.state.user, projectId);
      if (!canAccess) {
        return ctx.forbidden(t(ctx, "Sie sind nicht berechtigt, diese Vorprüfungen einzusehen."));
      }

      return await strapi.entityService.findMany(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        {
          filters: { project: projectId },
          fields: SAFE_TICKET_FIELDS,
          sort: [{ type: "asc" }, { attempt: "asc" }],
          populate: { overriddenBy: { fields: ["username"] } },
        }
      );
    },

    async create(ctx) {
      const { project: projectId, type, notes } = ctx.request.body?.data || {};
      if (!projectId || !type) {
        return ctx.badRequest(t(ctx, "Projekt und Typ sind erforderlich."));
      }

      const project = await fetchProjectForRecipient(projectId);
      if (!project) {
        return ctx.badRequest(t(ctx, "Projekt nicht gefunden."));
      }

      const canEdit = await userCanEditProject(strapi, ctx.state.user, projectId);
      if (!canEdit) {
        return ctx.forbidden(t(ctx, "Sie sind nicht berechtigt, für dieses Projekt eine Vorprüfung anzufragen."));
      }

      const live = await strapi.entityService.findMany(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        {
          filters: { project: projectId, type, supersededAt: { $null: true } },
          fields: ["id"],
          limit: 1,
        }
      );
      if (live.length > 0) {
        return ctx.badRequest(t(ctx, "Für diese Vorprüfung läuft bereits eine Anfrage."));
      }

      const contact = resolveRecipientContact(type, project);
      if (!contact) {
        return ctx.badRequest(t(ctx, "Für diese Vorprüfung ist keine Kontakt-E-Mail hinterlegt. Bitte hinterlegen Sie zuerst eine Kontakt-E-Mail für die Gemeinde bzw. den Fördermittelgeber."));
      }

      const attempt = await nextAttempt(strapi, projectId, type);

      let created;
      try {
        created = await strapi.entityService.create(
          "api::vorpruefung-ticket.vorpruefung-ticket",
          { data: { project: projectId, type, notes: notes || "", attempt, liveKey: liveKeyFor(projectId, type) } }
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          return ctx.badRequest(t(ctx, "Für diese Vorprüfung läuft bereits eine Anfrage."));
        }
        throw error;
      }

      return stripPrivate(created);
    },

    async updateNotes(ctx) {
      const ticket = await strapi.entityService.findOne(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        ctx.params.id,
        { fields: ["id", "supersededAt"], populate: { project: { fields: ["id"] } } }
      );
      if (!ticket || !ticket.project) {
        return ctx.notFound(t(ctx, "Vorprüfung nicht gefunden."));
      }

      const canEdit = await userCanEditProject(strapi, ctx.state.user, ticket.project.id);
      if (!canEdit) {
        return ctx.forbidden(t(ctx, "Sie sind nicht berechtigt, diese Vorprüfung zu bearbeiten."));
      }

      if (ticket.supersededAt) {
        return ctx.badRequest(t(ctx, "Diese Anfrage wurde bereits durch eine neuere ersetzt."));
      }

      const { notes } = ctx.request.body?.data || {};
      const updated = await strapi.entityService.update(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        ctx.params.id,
        { data: { notes: notes || "" } }
      );

      return { id: updated.id, notes: updated.notes };
    },

    async resend(ctx) {
      const ticket = await strapi.entityService.findOne(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        ctx.params.id,
        {
          fields: [
            "id", "type", "notes", "attempt", "status", "answeredAt", "supersededAt",
            "reviewerContact", "reviewerFirstName", "reviewerLastName",
          ],
          populate: {
            project: {
              fields: ["id", "title"],
              populate: { fundingGuideline: { fields: ["title"] } },
            },
          },
        }
      );

      if (!ticket || !ticket.project) {
        return ctx.notFound(t(ctx, "Vorprüfung nicht gefunden."));
      }

      const canEdit = await userCanEditProject(strapi, ctx.state.user, ticket.project.id);
      if (!canEdit) {
        return ctx.forbidden(t(ctx, "Sie sind nicht berechtigt, diese Vorprüfung erneut zu senden."));
      }

      if (ticket.supersededAt) {
        return ctx.badRequest(t(ctx, "Diese Anfrage wurde bereits durch eine neuere ersetzt."));
      }

      // An answered ticket is history and must stay untouched: retire it and
      // open a fresh attempt, whose afterCreate lifecycle mints the token and
      // sends the mail. An unanswered one is only nudged.
      if (ticket.answeredAt) {
        if (ticket.status === "positiv") {
          return ctx.badRequest(t(ctx, "Eine positiv beantwortete Vorprüfung kann nicht erneut angefragt werden."));
        }

        const project = await fetchProjectForRecipient(ticket.project.id);
        if (!(project && resolveRecipientContact(ticket.type, project))) {
          return ctx.badRequest(t(ctx, "Für diese Vorprüfung ist weiterhin keine Kontakt-E-Mail hinterlegt."));
        }

        const { count } = await strapi.db
          .query("api::vorpruefung-ticket.vorpruefung-ticket")
          .updateMany({
            where: { id: ticket.id, supersededAt: null },
            data: { supersededAt: new Date(), supersededReason: "resend", liveKey: null },
          });
        if (count === 0) {
          return ctx.badRequest(t(ctx, "Diese Anfrage wurde bereits durch eine neuere ersetzt."));
        }

        let created;
        try {
          created = await strapi.entityService.create(
            "api::vorpruefung-ticket.vorpruefung-ticket",
            {
              data: {
                project: ticket.project.id,
                type: ticket.type,
                notes: ticket.notes || "",
                attempt: (ticket.attempt || 1) + 1,
                liveKey: liveKeyFor(ticket.project.id, ticket.type),
              },
            }
          );
        } catch (error) {
          // Strapi commits the INSERT before it runs afterCreate, and afterCreate
          // is what sends the mail — so a throw from there leaves the new attempt
          // already live. Reverting the supersede in that case would leave two.
          let replacement = null;
          try {
            [replacement] = await strapi.entityService.findMany(
              "api::vorpruefung-ticket.vorpruefung-ticket",
              {
                filters: { project: ticket.project.id, type: ticket.type, supersededAt: { $null: true } },
                fields: ["id"],
                limit: 1,
              }
            );
          } catch (lookupError) {
            // Whether the attempt persisted is now unknown. Leaving the old row
            // superseded risks no live row, which the user fixes by resending;
            // reverting blindly risks two, which nothing fixes automatically.
            strapi.log.error(
              `vorpruefung resend: could not determine replacement state for ticket ${ticket.id}`,
              lookupError
            );
            throw error;
          }

          if (replacement && isUniqueViolation(error)) {
            return ctx.badRequest(t(ctx, "Für diese Vorprüfung läuft bereits eine Anfrage."));
          }
          if (!replacement) {
            await strapi.db
              .query("api::vorpruefung-ticket.vorpruefung-ticket")
              .updateMany({
                where: { id: ticket.id },
                data: {
                  supersededAt: null,
                  supersededReason: null,
                  liveKey: liveKeyFor(ticket.project.id, ticket.type),
                },
              });
          }
          throw error;
        }

        return { success: true, id: created.id, attempt: created.attempt };
      }

      let contact = ticket.reviewerContact
        ? { email: ticket.reviewerContact, firstName: ticket.reviewerFirstName, lastName: ticket.reviewerLastName }
        : null;
      if (!contact) {
        const project = await fetchProjectForRecipient(ticket.project.id);
        contact = project && resolveRecipientContact(ticket.type, project);
        if (!contact) {
          return ctx.badRequest(t(ctx, "Für diese Vorprüfung ist weiterhin keine Kontakt-E-Mail hinterlegt."));
        }
      }

      const token = crypto.randomUUID();
      const sentAt = new Date();
      const tokenExpiresAt = new Date(sentAt);
      tokenExpiresAt.setMonth(tokenExpiresAt.getMonth() + 2);

      await strapi.entityService.update(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        ticket.id,
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
        projectTitle: ticket.project.title,
        guidelineName: guidelineNameOf(ticket.project),
        type: ticket.type,
        token,
        variant: "resend",
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

      return { success: true, id: ticket.id, attempt: ticket.attempt || 1 };
    },

    async findByToken(ctx) {
      const rows = await strapi.entityService.findMany(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        {
          filters: { token: ctx.params.token },
          populate: {
            project: {
              fields: ["id", "title", "plannedStart", "plannedEnd", "fundingMatches", "questions"],
              populate: {
                details: true,
                financialPlan: true,
                fundingMatches: true,
                questions: true,
                files: true,
                media: true,
                links: true,
                categories: { fields: ["title"] },
                tags: { fields: ["title"] },
                estimatedCosts: true,
                info: true,
                editors: { fields: ["username"] },
                owner: { fields: ["username"] },
                fundingGuideline: { fields: ["title"] },
                municipality: { fields: ["title", "verwaltungssitz"] },
              },
            },
          },
        }
      );

      const ticket = rows[0];
      if (!ticket) {
        return ctx.notFound(t(ctx, "Dieser Link ist ungültig."));
      }

      if (new Date(ticket.tokenExpiresAt) < new Date()) {
        return ctx.notFound(t(ctx, "Dieser Link ist ungültig."));
      }

      if (ticket.supersededAt) {
        return ctx.notFound(t(ctx, "Dieser Link ist ungültig."));
      }

      // Project stays visible even after answering so the reviewer keeps
      // context; only the decision form is gated on `alreadyAnswered`.
      return {
        alreadyAnswered: !!ticket.answeredAt,
        answeredAt: ticket.answeredAt,
        project: ticket.project,
        ticket: {
          type: ticket.type,
          sentAt: ticket.sentAt,
          status: ticket.status,
          responseText: ticket.responseText,
          wantsPhoneCall: ticket.wantsPhoneCall,
          wantsOnsiteMeeting: ticket.wantsOnsiteMeeting,
          suggestedDates: ticket.suggestedDates,
        },
      };
    },

    async respondByToken(ctx) {
      const parsed = validateDecision(ctx.request.body);
      if (parsed.error) {
        return ctx.badRequest(t(ctx, parsed.error));
      }

      const { count } = await strapi.db
        .query("api::vorpruefung-ticket.vorpruefung-ticket")
        .updateMany({
          where: {
            token: ctx.params.token,
            answeredAt: null,
            supersededAt: null,
            tokenExpiresAt: { $gt: new Date() },
          },
          data: {
            ...parsed.data,
            answeredAt: new Date(),
          },
        });

      if (count === 0) {
        return ctx.notFound(t(ctx, "Dieser Link ist ungültig, abgelaufen oder wurde bereits beantwortet."));
      }

      return { success: true };
    },

    // Two entry points share this action (and so one permission): with a
    // ticket id it records the decision on that pending request; without one it
    // takes { project, type } and records the decision for whatever state that
    // review is in, so an admin never has to send a request first.
    async override(ctx) {
      if (ctx.state.user?.role?.type !== "admin") {
        return ctx.forbidden(t(ctx, "Nur Administratoren dürfen Vorprüfungen überschreiben."));
      }

      if (!ctx.params.id) {
        return overrideForProject(strapi, ctx);
      }

      const ticket = await strapi.entityService.findOne(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        ctx.params.id,
        { fields: ["id", "answeredAt", "supersededAt"], populate: { project: { fields: ["id"] } } }
      );
      if (!ticket || !ticket.project) {
        return ctx.notFound(t(ctx, "Vorprüfung nicht gefunden."));
      }
      if (ticket.supersededAt) {
        return ctx.badRequest(t(ctx, "Diese Anfrage wurde bereits durch eine neuere ersetzt."));
      }
      if (ticket.answeredAt) {
        return ctx.badRequest(t(ctx, "Diese Vorprüfung wurde bereits beantwortet."));
      }

      const parsed = validateDecision(ctx.request.body);
      if (parsed.error) {
        return ctx.badRequest(t(ctx, parsed.error));
      }

      return overridePending(strapi, ctx, ticket.id, parsed.data);
    },

    async resetForProject(ctx) {
      const projectId = Number(ctx.request.body?.project);
      if (!Number.isInteger(projectId)) {
        return ctx.badRequest(t(ctx, "Projekt-ID fehlt oder ist ungültig."));
      }

      const canEdit = await userCanEditProject(strapi, ctx.state.user, projectId);
      if (!canEdit) {
        return ctx.forbidden(t(ctx, "Sie sind nicht berechtigt, diese Vorprüfungen zurückzusetzen."));
      }

      // updateMany can't filter through the project relation (the joined
      // UPDATE errors out), so the ids are resolved first and retired in one
      // statement that re-checks supersededAt.
      const liveTickets = await strapi.entityService.findMany(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        {
          filters: { project: projectId, supersededAt: { $null: true } },
          fields: ["id"],
        }
      );
      if (liveTickets.length === 0) {
        return { success: true, count: 0 };
      }

      const { count } = await strapi.db
        .query("api::vorpruefung-ticket.vorpruefung-ticket")
        .updateMany({
          where: { id: { $in: liveTickets.map((ticket) => ticket.id) }, supersededAt: null },
          data: { supersededAt: new Date(), supersededReason: "fundingChanged", liveKey: null },
        });

      return { success: true, count };
    },
  })
);
