"use strict";

/**
 * Shared recipient-resolution helpers for vorpruefung-tickets.
 *
 * These deliberately live here rather than in
 * `content-types/vorpruefung-ticket/lifecycles.js`: Strapi's content-type
 * loader reads *every* file in a content-type folder and then validates the
 * resulting `lifecycles` object against the known lifecycle hook names, so any
 * extra export (or extra sibling file) makes the server refuse to boot with
 * "lifecycles field has unspecified keys". A module at the api root is not
 * auto-loaded by Strapi (only `index.js` is), so it is safe to require directly
 * from both the lifecycle and the controller.
 */

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

async function fetchProjectForRecipient(projectId) {
  return strapi.entityService.findOne("api::project.project", projectId, {
    fields: ["id", "title"],
    populate: {
      municipality: { fields: ["financeContactEmail", "personnelContactEmail"] },
      fundingGuideline: { populate: { info: { fields: ["email"] } } },
    },
  });
}

module.exports = {
  resolveRecipient,
  fetchProjectForRecipient,
};
