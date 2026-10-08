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
  return project?.fundingGuideline?.[0]?.title || null;
}

// Projects created through the funding-check step keep their chosen funding
// only in `fundingMatches`; the `fundingGuideline` relation stays empty.
// Several can be selected, so the first one in saved order is the provider.
function selectedFundingIdOf(fundingMatches) {
  const selected = (Array.isArray(fundingMatches) ? fundingMatches : []).find(
    (match) => match?.selected && !match.isFehlanzeige
  );
  const id = Number(selected?.external_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function fetchSelectedFunding(fundingMatches, populate) {
  const fundingId = selectedFundingIdOf(fundingMatches);
  if (!fundingId) return null;
  return strapi.entityService.findOne("api::funding.funding", fundingId, {
    fields: ["title"],
    populate,
  });
}

// Selected matches whose funding record cannot be resolved (legacy matches
// without `external_id`, deleted fundings) stay listed by title only.
async function fetchSelectedFundings(fundingMatches) {
  const selected = (Array.isArray(fundingMatches) ? fundingMatches : []).filter(
    (match) => match?.selected && !match.isFehlanzeige
  );
  return Promise.all(
    selected.map(async (match) => {
      const id = Number(match.external_id);
      const funding =
        Number.isInteger(id) && id > 0
          ? await strapi.entityService.findOne("api::funding.funding", id, {
              fields: ["title", "ownContribution", "accumulability"],
              populate: { rates: true },
            })
          : null;
      return funding || { id: null, title: match.title };
    })
  );
}

async function fetchProjectForRecipient(projectId) {
  const found = await strapi.entityService.findOne("api::project.project", projectId, {
    fields: ["id", "title", "fundingMatches"],
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
  if (!found) return found;

  const { fundingMatches, ...project } = found;
  const selectedFunding = await fetchSelectedFunding(fundingMatches, {
    info: { fields: ["email", "contactFirstName", "contactLastName"] },
  });
  if (selectedFunding) {
    project.fundingGuideline = [selectedFunding];
  }
  return project;
}

module.exports = {
  resolveRecipientContact,
  guidelineNameOf,
  fetchSelectedFunding,
  fetchSelectedFundings,
  fetchProjectForRecipient,
};
