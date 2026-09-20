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

async function loadUserDetail(strapi, userId) {
  const userDetails = await strapi.entityService.findMany("api::user-detail.user-detail", {
    filters: { user: { id: userId } },
    populate: {
      municipality: { fields: ["id"] },
      landkreis: { fields: ["id"] },
      assignedLocation: { fields: ["id"] },
      federalState: { fields: ["id"] },
    },
  });
  return userDetails?.[0] || null;
}

function resolveDetailAnchorScope(strapi, detail) {
  if (detail.assignedLocation) return resolveScope(strapi, { locationId: detail.assignedLocation.id });
  if (detail.municipality) return resolveScope(strapi, { municipalityId: detail.municipality.id });
  if (detail.landkreis) return resolveScope(strapi, { landkreisId: detail.landkreis.id });
  if (detail.federalState) return resolveScope(strapi, { federalStateId: detail.federalState.id });
  return null;
}

/**
 * Resolves a user's scope from their user-detail record's assigned levels.
 * The most specific assigned level is the anchor: location > municipality >
 * landkreis > federalState. The result is everything reachable from that
 * anchor (all parents and children), so it answers "what may this user see
 * or work in", not "what is this user assigned to" - for the latter use
 * resolveUserAssignedLevels. Returns null if the user has no level assigned
 * at all, matching the previous callers' "unauthorized, no municipality
 * assigned" behavior.
 */
async function resolveUserScope(strapi, userId) {
  const detail = await loadUserDetail(strapi, userId);
  if (!detail) return null;
  return resolveDetailAnchorScope(strapi, detail);
}

/**
 * The federal state / landkreis / municipality ids a user is actually
 * assigned to. A level the admin set explicitly is used as the only id for
 * that level - this is what tells apart the two federal states a landkreis
 * may belong to. A level the user was never given falls back to everything
 * reachable from their anchor, so a user with incomplete data is not locked
 * out. Returns null if no level is assigned at all.
 */
async function resolveUserAssignedLevels(strapi, userId) {
  const detail = await loadUserDetail(strapi, userId);
  if (!detail) return null;
  const derived = await resolveDetailAnchorScope(strapi, detail);
  if (!derived) return null;
  return {
    federalStateIds: detail.federalState ? [detail.federalState.id] : derived.federalStateIds,
    landkreisIds: detail.landkreis ? [detail.landkreis.id] : derived.landkreisIds,
    municipalityIds: detail.municipality ? [detail.municipality.id] : derived.municipalityIds,
  };
}

/**
 * Whether a funding is visible to a user with the given assigned levels.
 * A funding is compared at its own most specific level only - municipalities,
 * else landkreise, else federal states - so a landkreis-wide funding is
 * visible to users assigned to that landkreis, not to every user whose
 * municipality happens to lie in it. A funding with no level set is visible
 * to everyone.
 *
 * @param {object} funding - populated with federalStates/landkreise/municipalities (ids only needed)
 * @param {{federalStateIds:number[], landkreisIds:number[], municipalityIds:number[]}} levels
 */
function isFundingVisibleToLevels(funding, levels) {
  const overlaps = (records, ids) => (records || []).some((r) => ids.includes(r.id));
  if (funding.municipalities?.length > 0) return overlaps(funding.municipalities, levels.municipalityIds);
  if (funding.landkreise?.length > 0) return overlaps(funding.landkreise, levels.landkreisIds);
  if (funding.federalStates?.length > 0) return overlaps(funding.federalStates, levels.federalStateIds);
  return true;
}

const idOf = (value) => (value && typeof value === "object" ? value.id : value) ?? null;

/**
 * Reads the assigned levels off a request body, which carries each relation
 * either as `{ id }` or as a bare id. A level that is missing or null comes
 * back as null.
 */
function pickAssignedLevels(source = {}) {
  return {
    federalStateId: idOf(source.federalState),
    landkreisId: idOf(source.landkreis),
    municipalityId: idOf(source.municipality),
    locationId: idOf(source.assignedLocation),
  };
}

/**
 * False when two assigned levels positively contradict each other, e.g. a
 * municipality that is not in the chosen landkreis. A parent list that is
 * empty in the data tells us nothing, so it never counts as a contradiction -
 * the hierarchy relations are not guaranteed to be complete.
 */
async function areLevelsConsistent(strapi, { federalStateId, landkreisId, municipalityId, locationId }) {
  const ids = (records) => (records || []).map((r) => r.id);
  const contradicts = (parentIds, id) => parentIds.length > 0 && !parentIds.includes(id);

  const [municipality, landkreis, location] = await Promise.all([
    municipalityId
      ? strapi.entityService.findOne("api::municipality.municipality", municipalityId, {
          populate: { landkreise: { fields: ["id"] }, federalStates: { fields: ["id"] } },
        })
      : null,
    landkreisId
      ? strapi.entityService.findOne("api::landkreis.landkreis", landkreisId, {
          populate: { federalStates: { fields: ["id"] } },
        })
      : null,
    locationId
      ? strapi.entityService.findOne("api::location.location", locationId, {
          populate: {
            municipality: { fields: ["id"] },
            landkreise: { fields: ["id"] },
            federalStates: { fields: ["id"] },
          },
        })
      : null,
  ]);

  if (municipality && landkreisId && contradicts(ids(municipality.landkreise), landkreisId)) return false;
  if (municipality && federalStateId && contradicts(ids(municipality.federalStates), federalStateId)) return false;
  if (landkreis && federalStateId && contradicts(ids(landkreis.federalStates), federalStateId)) return false;
  if (location) {
    if (municipalityId) {
      if (location.municipality && location.municipality.id !== municipalityId) return false;
    } else {
      if (landkreisId && contradicts(ids(location.landkreise), landkreisId)) return false;
      if (federalStateId && contradicts(ids(location.federalStates), federalStateId)) return false;
    }
  }
  return true;
}

module.exports = { resolveScope, resolveUserScope, resolveUserAssignedLevels, isFundingVisibleToLevels, pickAssignedLevels, areLevelsConsistent };
