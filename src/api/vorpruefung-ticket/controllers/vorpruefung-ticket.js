"use strict";

/**
 * vorpruefung-ticket controller
 */

const crypto = require("crypto");
const { createCoreController } = require("@strapi/strapi").factories;
const { resolveRecipient, fetchProjectForRecipient } = require("../recipient.js");
const { userCanAccessProject } = require("../access.js");

// "sent" is deliberately excluded — a reviewer must never be able to reset a
// ticket back to the initial "sent" state via this public endpoint.
const ALLOWED_DECISIONS = ["positiv", "negativ", "ruecksprache"];

// Every field except `token` (private — the review-link secret) and the
// `project` relation itself (the FE already knows which project it asked
// for). Custom actions on this controller bypass Strapi's core `find`, so
// they don't get its automatic private-field stripping for free — this is
// the explicit substitute.
const SAFE_TICKET_FIELDS = [
  "id", "type", "notes", "status", "wantsPhoneCall", "wantsOnsiteMeeting",
  "responseText", "reviewerContact", "tokenExpiresAt", "sentAt", "answeredAt",
  "reminderSentAt", "createdAt", "updatedAt",
];

module.exports = createCoreController(
  "api::vorpruefung-ticket.vorpruefung-ticket",
  ({ strapi }) => ({
    async find(ctx) {
      const rawProjectId = ctx.query?.filters?.project;
      const projectId = Number(rawProjectId);
      if (!rawProjectId || !Number.isInteger(projectId)) {
        return ctx.badRequest("Projekt-ID fehlt oder ist ungültig.");
      }

      const canAccess = await userCanAccessProject(strapi, ctx.state.user, projectId);
      if (!canAccess) {
        return ctx.forbidden("Sie sind nicht berechtigt, diese Vorprüfungen einzusehen.");
      }

      return await strapi.entityService.findMany(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        {
          filters: { project: projectId },
          fields: SAFE_TICKET_FIELDS,
        }
      );
    },

    async create(ctx) {
      const { project: projectId, type, notes } = ctx.request.body?.data || {};
      if (!projectId || !type) {
        return ctx.badRequest("Projekt und Typ sind erforderlich.");
      }

      const project = await fetchProjectForRecipient(projectId);
      if (!project) {
        return ctx.badRequest("Projekt nicht gefunden.");
      }

      const canAccess = await userCanAccessProject(strapi, ctx.state.user, projectId);
      if (!canAccess) {
        return ctx.forbidden("Sie sind nicht berechtigt, für dieses Projekt eine Vorprüfung anzufragen.");
      }

      const recipient = resolveRecipient(type, project);
      if (!recipient) {
        return ctx.badRequest(
          "Für diese Vorprüfung ist keine Kontakt-E-Mail hinterlegt. Bitte hinterlegen Sie zuerst eine Kontakt-E-Mail für die Gemeinde bzw. den Fördermittelgeber."
        );
      }

      const created = await strapi.entityService.create(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        { data: { project: projectId, type, notes: notes || "" } }
      );

      const { token: _omit, ...safeCreated } = created;
      return safeCreated;
    },

    async updateNotes(ctx) {
      const ticket = await strapi.entityService.findOne(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        ctx.params.id,
        { fields: ["id"], populate: { project: { fields: ["id"] } } }
      );
      if (!ticket || !ticket.project) {
        return ctx.notFound("Vorprüfung nicht gefunden.");
      }

      const canAccess = await userCanAccessProject(strapi, ctx.state.user, ticket.project.id);
      if (!canAccess) {
        return ctx.forbidden("Sie sind nicht berechtigt, diese Vorprüfung zu bearbeiten.");
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
          fields: ["id", "type", "reviewerContact"],
          populate: { project: { fields: ["id", "title"] } },
        }
      );

      if (!ticket || !ticket.project) {
        return ctx.notFound("Vorprüfung nicht gefunden.");
      }

      const canAccess = await userCanAccessProject(strapi, ctx.state.user, ticket.project.id);
      if (!canAccess) {
        return ctx.forbidden("Sie sind nicht berechtigt, diese Vorprüfung erneut zu senden.");
      }

      let recipient = ticket.reviewerContact;
      if (!recipient) {
        const project = await fetchProjectForRecipient(ticket.project.id);
        recipient = project && resolveRecipient(ticket.type, project);
        if (!recipient) {
          return ctx.badRequest(
            "Für diese Vorprüfung ist weiterhin keine Kontakt-E-Mail hinterlegt."
          );
        }
      }

      const token = crypto.randomUUID();
      const sentAt = new Date();
      const tokenExpiresAt = new Date(sentAt);
      tokenExpiresAt.setMonth(tokenExpiresAt.getMonth() + 2);

      await strapi.entityService.update(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        ticket.id,
        { data: { token, sentAt, tokenExpiresAt, reviewerContact: recipient } }
      );

      await strapi.plugins["email"].services.email.send({
        to: recipient,
        from: process.env.DEF_FROM,
        replyTo: process.env.DEF_FROM,
        subject: `Vorprüfung angefragt: ${ticket.project.title}`,
        html: `Für das Projekt "${ticket.project.title}" wurde eine Vorprüfung (${ticket.type}) erneut angefragt. Bitte antworten Sie über den folgenden Link: <br/><p>${process.env.VORPRUEFUNG_REVIEW_PAGE}${token}</p>`,
      });

      return { success: true };
    },

    async findByToken(ctx) {
      const rows = await strapi.entityService.findMany(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        {
          filters: { token: ctx.params.token },
          populate: {
            project: {
              fields: ["id", "title", "plannedStart", "plannedEnd"],
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
                municipality: { fields: ["title", "location"] },
              },
            },
          },
        }
      );

      const ticket = rows[0];
      if (!ticket) {
        return ctx.notFound("Dieser Link ist ungültig.");
      }

      if (new Date(ticket.tokenExpiresAt) < new Date()) {
        return ctx.notFound("Dieser Link ist ungültig.");
      }

      if (ticket.answeredAt) {
        return { alreadyAnswered: true, answeredAt: ticket.answeredAt };
      }

      return { alreadyAnswered: false, project: ticket.project };
    },

    async respondByToken(ctx) {
      const { decisionType, responseText, wantsPhoneCall, wantsOnsiteMeeting } =
        ctx.request.body || {};

      if (!decisionType) {
        return ctx.badRequest("Bitte wählen Sie eine Entscheidung aus.");
      }
      if (!ALLOWED_DECISIONS.includes(decisionType)) {
        return ctx.badRequest("Ungültige Entscheidung.");
      }
      if (!responseText) {
        return ctx.badRequest("Bitte geben Sie eine Antwort ein.");
      }

      const { count } = await strapi.db
        .query("api::vorpruefung-ticket.vorpruefung-ticket")
        .updateMany({
          where: {
            token: ctx.params.token,
            answeredAt: null,
            tokenExpiresAt: { $gt: new Date() },
          },
          data: {
            status: decisionType,
            responseText,
            wantsPhoneCall: !!wantsPhoneCall,
            wantsOnsiteMeeting: !!wantsOnsiteMeeting,
            answeredAt: new Date(),
          },
        });

      if (count === 0) {
        return ctx.notFound("Dieser Link ist ungültig, abgelaufen oder wurde bereits beantwortet.");
      }

      return { success: true };
    },
  })
);
