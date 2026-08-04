"use strict";

/**
 * vorpruefung-ticket controller
 */

const crypto = require("crypto");
const { createCoreController } = require("@strapi/strapi").factories;
const { resolveRecipient, fetchProjectForRecipient } = require("../recipient.js");

// "sent" is deliberately excluded — a reviewer must never be able to reset a
// ticket back to the initial "sent" state via this public endpoint.
const ALLOWED_DECISIONS = ["positiv", "negativ", "ruecksprache"];

module.exports = createCoreController(
  "api::vorpruefung-ticket.vorpruefung-ticket",
  ({ strapi }) => ({
    async find(ctx) {
      const projectFilter = ctx.query?.filters?.project;
      const projectId = (projectFilter && projectFilter.id) || projectFilter;

      if (ctx.state.user.role.type !== "admin") {
        if (!projectId) {
          return ctx.badRequest("Projekt-ID fehlt.");
        }

        const project = await strapi.entityService.findOne("api::project.project", projectId, {
          fields: ["id", "visibility"],
          populate: {
            owner: { fields: ["id"] },
            editors: { fields: ["id"] },
            readers: { fields: ["id"] },
          },
        });

        if (!project) {
          return ctx.notFound("Projekt nicht gefunden.");
        }

        const userId = ctx.state.user.id;
        const isOwner = !!project.owner && project.owner.id === userId;
        const isEditor = (project.editors || []).some((e) => e.id === userId);
        const isReader = (project.readers || []).some((r) => r.id === userId);
        const isOpenVisibility = project.visibility === "listed only" || project.visibility === "all users";

        if (!isOwner && !isEditor && !isReader && !isOpenVisibility) {
          return ctx.forbidden("Sie sind nicht berechtigt, diese Vorprüfungen einzusehen.");
        }
      }

      return await strapi.entityService.findMany(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        { filters: ctx.query.filters, populate: ctx.query.populate }
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

      const recipient = resolveRecipient(type, project);
      if (!recipient) {
        return ctx.badRequest(
          "Für diese Vorprüfung ist keine Kontakt-E-Mail hinterlegt. Bitte hinterlegen Sie zuerst eine Kontakt-E-Mail für die Gemeinde bzw. den Fördermittelgeber."
        );
      }

      return await strapi.entityService.create(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        { data: { project: projectId, type, notes: notes || "" } }
      );
    },

    async updateNotes(ctx) {
      const ticket = await strapi.entityService.findOne(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        ctx.params.id,
        { fields: ["id"] }
      );
      if (!ticket) {
        return ctx.notFound("Vorprüfung nicht gefunden.");
      }

      const { notes } = ctx.request.body?.data || {};
      return await strapi.entityService.update(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        ctx.params.id,
        { data: { notes: notes || "" } }
      );
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

      if (!ticket) {
        return ctx.notFound("Vorprüfung nicht gefunden.");
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
