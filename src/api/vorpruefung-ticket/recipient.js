"use strict";

/**
 * Shared recipient-resolution helpers for vorpruefung-tickets.
 *
 * These deliberately live here rather than in
 * `content-types/vorpruefung-ticket/lifecycles.js`: Strapi's content-type
 * loader validates that file's exports strictly against the known lifecycle
 * hook names, so any extra export there makes the server refuse to boot with
 * "lifecycles field has unspecified keys". A module at the api root is not
 * auto-loaded by Strapi (only `index.js` is), so it is safe to require directly
 * from both the lifecycle and the controller.
 */

function resolveRecipientContact(type, project) {
  if (type === "finanzen") {
    const email = project.municipality?.financeContactEmail || null;
    if (!email) return null;
    return {
      email,
      firstName: project.municipality?.financeContactFirstName || null,
      lastName: project.municipality?.financeContactLastName || null,
    };
  }
  if (type === "personal") {
    const email = project.municipality?.personnelContactEmail || null;
    if (!email) return null;
    return {
      email,
      firstName: project.municipality?.personnelContactFirstName || null,
      lastName: project.municipality?.personnelContactLastName || null,
    };
  }
  if (type === "foerdermittelgeber") {
    const info = project.fundingGuideline?.[0]?.info;
    const email = info?.email || null;
    if (!email) return null;
    return {
      email,
      firstName: info?.contactFirstName || null,
      lastName: info?.contactLastName || null,
    };
  }
  return null;
}

function guidelineNameOf(project) {
  return project.fundingGuideline?.[0]?.title || null;
}

async function fetchProjectForRecipient(projectId) {
  return strapi.entityService.findOne("api::project.project", projectId, {
    fields: ["id", "title"],
    populate: {
      municipality: {
        fields: [
          "financeContactEmail",
          "financeContactFirstName",
          "financeContactLastName",
          "personnelContactEmail",
          "personnelContactFirstName",
          "personnelContactLastName",
        ],
      },
      fundingGuideline: {
        fields: ["title"],
        populate: { info: { fields: ["email", "contactFirstName", "contactLastName"] } },
      },
    },
  });
}

module.exports = {
  resolveRecipientContact,
  guidelineNameOf,
  fetchProjectForRecipient,
};
