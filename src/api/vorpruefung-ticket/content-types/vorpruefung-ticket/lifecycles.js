"use strict";

const crypto = require("crypto");
const { resolveRecipient, fetchProjectForRecipient } = require("../../recipient.js");

// NOTE: Strapi validates this module's exports against the known lifecycle hook
// names and refuses to boot on anything else, so the shared recipient helpers
// live in `src/api/vorpruefung-ticket/recipient.js` instead of being re-exported
// from here.
module.exports = {
  async afterCreate(event) {
    const { result, params } = event;

    const rawProjectId = params?.data?.project;
    const projectId = (rawProjectId && rawProjectId.id) || rawProjectId;
    if (!projectId) {
      return;
    }

    const project = await fetchProjectForRecipient(projectId);
    if (!project) {
      return;
    }

    const recipient = resolveRecipient(result.type, project);
    if (!recipient) {
      return;
    }

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
          reviewerContact: recipient,
        },
      }
    );

    await strapi.plugins["email"].services.email.send({
      to: recipient,
      from: process.env.DEF_FROM,
      replyTo: process.env.DEF_FROM,
      subject: `Vorprüfung angefragt: ${project.title}`,
      html: `Für das Projekt "${project.title}" wurde eine Vorprüfung (${result.type}) angefragt. Bitte antworten Sie über den folgenden Link: <br/><p>${process.env.VORPRUEFUNG_REVIEW_PAGE}${token}</p>`,
    });
  },
};
