"use strict";

/**
 * vorpruefung-ticket controller
 */

const crypto = require("crypto");
const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::vorpruefung-ticket.vorpruefung-ticket",
  ({ strapi }) => ({
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

      const token = crypto.randomUUID();
      const sentAt = new Date();
      const tokenExpiresAt = new Date(sentAt);
      tokenExpiresAt.setMonth(tokenExpiresAt.getMonth() + 2);

      await strapi.entityService.update(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        ticket.id,
        { data: { token, sentAt, tokenExpiresAt } }
      );

      await strapi.plugins["email"].services.email.send({
        to: ticket.reviewerContact,
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
              fields: ["id", "title"],
              populate: {
                details: true,
                financialPlan: true,
                fundingMatches: true,
                questions: true,
                files: true,
                media: true,
                links: true,
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
      if (!responseText) {
        return ctx.badRequest("Bitte geben Sie eine Antwort ein.");
      }

      const { count } = await strapi.db
        .query("api::vorpruefung-ticket.vorpruefung-ticket")
        .updateMany({
          where: { token: ctx.params.token, answeredAt: null },
          data: {
            status: decisionType,
            responseText,
            wantsPhoneCall: !!wantsPhoneCall,
            wantsOnsiteMeeting: !!wantsOnsiteMeeting,
            answeredAt: new Date(),
          },
        });

      if (count === 0) {
        return ctx.notFound("Dieser Link ist ungültig oder wurde bereits beantwortet.");
      }

      return { success: true };
    },
  })
);
