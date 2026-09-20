"use strict";

/**
 * Shared admin-hierarchy scope resolution.
 *
 * Replaces the near-identical "resolve a user's/record's scope from whichever
 * single level it's anchored to" logic that used to be duplicated across
 * funding.js, project.js, prioritized-project.js, location.js and user-detail.js.
 *
 * Federal State / Landkreis / Municipality / Ort(location) are a many-to-many
 * lattice, not a strict tree - a given anchor can resolve to more than one
 * parent (e.g. a Landkreis spanning two Federal States). resolveScope always
 * walks the anchor's own stored relations, both up (to broader levels) and
 * down (to narrower levels), and returns every id it can derive - it never
 * fails just because some relations are empty, only when the anchor itself
 * doesn't exist.
 */

/**
 * @param {object} strapi - the Strapi instance
 * @param {{locationId?, municipalityId?, landkreisId?, federalStateId?}} anchor
 *   Exactly one is expected in the common case. If more than one is passed,
 *   the most specific wins: location > municipality > landkreis > federalState.
 * @returns {Promise<{federalStateIds:number[], landkreisIds:number[], municipalityIds:number[], locationIds:number[]} | null>}
 *   null only when the given anchor id doesn't resolve to a real record.
 */
async function resolveScope(strapi, { locationId, municipalityId, landkreisId, federalStateId } = {}) {
  if (locationId) {
    const location = await strapi.entityService.findOne("api::location.location", locationId, {
      populate: {
        municipality: {
          populate: {
            federalStates: { fields: ["id"] },
            landkreise: { fields: ["id"] },
          },
        },
        federalStates: { fields: ["id"] },
        landkreise: { fields: ["id"] },
      },
    });
    if (!location) return null;

    const municipality = location.municipality || null;
    const federalStateIds = new Set();
    (location.federalStates || []).forEach((fs) => federalStateIds.add(fs.id));
    (municipality?.federalStates || []).forEach((fs) => federalStateIds.add(fs.id));
    const landkreisIds = new Set();
    (location.landkreise || []).forEach((lk) => landkreisIds.add(lk.id));
    (municipality?.landkreise || []).forEach((lk) => landkreisIds.add(lk.id));

    return {
      federalStateIds: [...federalStateIds],
      landkreisIds: [...landkreisIds],
      municipalityIds: municipality ? [municipality.id] : [],
      locationIds: [locationId],
    };
  }

  if (municipalityId) {
    const municipality = await strapi.entityService.findOne(
      "api::municipality.municipality",
      municipalityId,
      {
        populate: {
          federalStates: { fields: ["id"] },
          landkreise: { fields: ["id"] },
          locations: { fields: ["id"] },
        },
      }
    );
    if (!municipality) return null;

    return {
      federalStateIds: (municipality.federalStates || []).map((fs) => fs.id),
      landkreisIds: (municipality.landkreise || []).map((lk) => lk.id),
      municipalityIds: [municipalityId],
      locationIds: (municipality.locations || []).map((l) => l.id),
    };
  }

  if (landkreisId) {
    const landkreis = await strapi.entityService.findOne("api::landkreis.landkreis", landkreisId, {
      populate: {
        federalStates: { fields: ["id"] },
        municipalities: {
          populate: {
            federalStates: { fields: ["id"] },
            locations: { fields: ["id"] },
          },
        },
        locations: { fields: ["id"] },
      },
    });
    if (!landkreis) return null;

    // Fall back to the union of the landkreis's own municipalities' federal
    // states, in case the landkreis itself wasn't directly linked to one.
    const federalStateIds = new Set();
    (landkreis.federalStates || []).forEach((fs) => federalStateIds.add(fs.id));
    (landkreis.municipalities || []).forEach((m) =>
      (m.federalStates || []).forEach((fs) => federalStateIds.add(fs.id))
    );

    const locationIds = new Set();
    (landkreis.locations || []).forEach((l) => locationIds.add(l.id));
    (landkreis.municipalities || []).forEach((m) =>
      (m.locations || []).forEach((l) => locationIds.add(l.id))
    );

    return {
      federalStateIds: [...federalStateIds],
      landkreisIds: [landkreisId],
      municipalityIds: (landkreis.municipalities || []).map((m) => m.id),
      locationIds: [...locationIds],
    };
  }

  if (federalStateId) {
    const federalState = await strapi.entityService.findOne(
      "api::federal-state.federal-state",
      federalStateId,
      {
        populate: {
          landkreise: { fields: ["id"] },
          municipalities: { fields: ["id"] },
          locations: { fields: ["id"] },
        },
      }
    );
    if (!federalState) return null;

    return {
      federalStateIds: [federalStateId],
      landkreisIds: (federalState.landkreise || []).map((lk) => lk.id),
      municipalityIds: (federalState.municipalities || []).map((m) => m.id),
      locationIds: (federalState.locations || []).map((l) => l.id),
    };
  }

  return null;
}

/**
 * Resolves a user's scope from their user-detail record's assigned anchor.
 * Precedence when more than one is set (legacy data): location > municipality
 * > landkreis - most specific wins, matching resolveScope()'s own anchor
 * precedence. Returns null if the user has no scope assigned at all, matching
 * the previous callers' "unauthorized, no municipality assigned" behavior.
 */
async function resolveUserScope(strapi, userId) {
  const userDetails = await strapi.entityService.findMany("api::user-detail.user-detail", {
    filters: { user: { id: userId } },
    populate: {
      municipality: { fields: ["id"] },
      landkreis: { fields: ["id"] },
      assignedLocation: { fields: ["id"] },
    },
  });
  const detail = userDetails?.[0];
  if (!detail) return null;
  if (detail.assignedLocation) return resolveScope(strapi, { locationId: detail.assignedLocation.id });
  if (detail.municipality) return resolveScope(strapi, { municipalityId: detail.municipality.id });
  if (detail.landkreis) return resolveScope(strapi, { landkreisId: detail.landkreis.id });
  return null;
}

/**
 * Resolves a funding's effective scope after applying the cascade/fallback
 * rule:
 *   - explicit municipalities set -> no cascade, use as-is
 *   - else explicit landkreise set -> expand to all municipalities under them
 *   - else explicit federal states set -> expand to all landkreise and all
 *     municipalities under them
 *   - else nothing set -> empty scope (visible to nobody)
 *
 * @param {object} funding - populated with federalStates/landkreise/municipalities (ids only needed)
 */
async function resolveFundingEffectiveScope(strapi, funding) {
  const explicitMunicipalityIds = (funding.municipalities || []).map((m) => m.id);
  const explicitLandkreisIds = (funding.landkreise || []).map((lk) => lk.id);
  const explicitFederalStateIds = (funding.federalStates || []).map((fs) => fs.id);

  if (explicitMunicipalityIds.length > 0) {
    return {
      effectiveLandkreisIds: explicitLandkreisIds,
      effectiveMunicipalityIds: explicitMunicipalityIds,
    };
  }

  if (explicitLandkreisIds.length > 0) {
    const municipalityIds = new Set();
    for (const landkreisId of explicitLandkreisIds) {
      const scope = await resolveScope(strapi, { landkreisId });
      (scope?.municipalityIds || []).forEach((id) => municipalityIds.add(id));
    }
    return {
      effectiveLandkreisIds: explicitLandkreisIds,
      effectiveMunicipalityIds: [...municipalityIds],
    };
  }

  if (explicitFederalStateIds.length > 0) {
    const landkreisIds = new Set();
    const municipalityIds = new Set();
    for (const federalStateId of explicitFederalStateIds) {
      const scope = await resolveScope(strapi, { federalStateId });
      (scope?.landkreisIds || []).forEach((id) => landkreisIds.add(id));
      (scope?.municipalityIds || []).forEach((id) => municipalityIds.add(id));
    }
    return {
      effectiveLandkreisIds: [...landkreisIds],
      effectiveMunicipalityIds: [...municipalityIds],
    };
  }

  return { effectiveLandkreisIds: [], effectiveMunicipalityIds: [] };
}

module.exports = { resolveScope, resolveUserScope, resolveFundingEffectiveScope };
