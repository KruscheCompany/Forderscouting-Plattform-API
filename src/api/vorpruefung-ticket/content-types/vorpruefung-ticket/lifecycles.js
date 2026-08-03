"use strict";

const crypto = require("crypto");

function resolveRecipient(type, project) {
  if (type === "finanzen") {
    return project.municipality?.financeContactEmail || null;
  }
  if (type === "personal") {
    return project.municipality?.personnelContactEmail || null;
  }
  if (type === "foerdermittelgeber") {
    return project.fundingGuideline?.[0]?.info?.email || null;
  }
  return null;
}

module.exports = {
  async afterCreate(event) {
    const { result } = event;

    const project = await strapi.entityService.findOne(
      "api::project.project",
      result.project,
      {
        fields: ["id", "title"],
        populate: {
          municipality: { fields: ["financeContactEmail", "personnelContactEmail"] },
          fundingGuideline: { populate: { info: { fields: ["email"] } } },
        },
      }
    );

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
