"use strict";

/**
 * Shared admin-hierarchy scope resolution.
 *
 * Replaces the near-identical "resolve a user's/record's scope from whichever
 * single level it's anchored to" logic that used to be duplicated across
 * funding.js, project.js, prioritized-project.js, location.js and user-detail.js.
 *
 * Federal State / Landkreis / Municipality are many-to-many, Ort(location)
 * belongs to one municipality. Only the one-level-up links are stored
 * (landkreis -> federal states, municipality -> landkreise, location ->
 * municipality); every other level is derived by walking those links through
 * all parents (up) or all children (down) and unioning the results. It never
 * fails just because some relations are empty, only when the anchor itself
 * doesn't exist.
 */

const uniq = (ids) => [...new Set(ids)];
const idsOf = (records) => (records || []).map((r) => r.id);
const flatIds = (records, pick) => uniq((records || []).flatMap((r) => idsOf(pick(r))));

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
            landkreise: { populate: { federalStates: { fields: ["id"] } } },
          },
        },
      },
    });
    if (!location) return null;

    const municipality = location.municipality || null;
    const landkreise = municipality?.landkreise || [];
    return {
      federalStateIds: flatIds(landkreise, (lk) => lk.federalStates),
      landkreisIds: idsOf(landkreise),
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
          landkreise: { populate: { federalStates: { fields: ["id"] } } },
          locations: { fields: ["id"] },
        },
      }
    );
    if (!municipality) return null;

    return {
      federalStateIds: flatIds(municipality.landkreise, (lk) => lk.federalStates),
      landkreisIds: idsOf(municipality.landkreise),
      municipalityIds: [municipalityId],
      locationIds: idsOf(municipality.locations),
    };
  }

  if (landkreisId) {
    const landkreis = await strapi.entityService.findOne("api::landkreis.landkreis", landkreisId, {
      populate: {
        federalStates: { fields: ["id"] },
        municipalities: { populate: { locations: { fields: ["id"] } } },
      },
    });
    if (!landkreis) return null;

    return {
      federalStateIds: idsOf(landkreis.federalStates),
      landkreisIds: [landkreisId],
      municipalityIds: idsOf(landkreis.municipalities),
      locationIds: flatIds(landkreis.municipalities, (m) => m.locations),
    };
  }

  if (federalStateId) {
    const federalState = await strapi.entityService.findOne(
      "api::federal-state.federal-state",
      federalStateId,
      {
        populate: {
          landkreise: {
            populate: { municipalities: { populate: { locations: { fields: ["id"] } } } },
          },
        },
      }
    );
    if (!federalState) return null;

    const landkreise = federalState.landkreise || [];
    const municipalities = landkreise.flatMap((lk) => lk.municipalities || []);
    return {
      federalStateIds: [federalStateId],
      landkreisIds: idsOf(landkreise),
      municipalityIds: uniq(idsOf(municipalities)),
      locationIds: flatIds(municipalities, (m) => m.locations),
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
 * to nobody (admins bypass this check).
 *
 * @param {object} funding - populated with federalStates/landkreise/municipalities (ids only needed)
 * @param {{federalStateIds:number[], landkreisIds:number[], municipalityIds:number[]}} levels
 */
function isFundingVisibleToLevels(funding, levels) {
  const overlaps = (records, ids) => (records || []).some((r) => ids.includes(r.id));
  if (funding.municipalities?.length > 0) return overlaps(funding.municipalities, levels.municipalityIds);
  if (funding.landkreise?.length > 0) return overlaps(funding.landkreise, levels.landkreisIds);
  if (funding.federalStates?.length > 0) return overlaps(funding.federalStates, levels.federalStateIds);
  return false;
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
