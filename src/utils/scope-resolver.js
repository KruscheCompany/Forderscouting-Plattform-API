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
      landkreisIds: uniq(idsOf(landkreise)),
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
      landkreisIds: uniq(idsOf(municipality.landkreise)),
      municipalityIds: [municipalityId],
      locationIds: uniq(idsOf(municipality.locations)),
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
      municipalityIds: uniq(idsOf(landkreis.municipalities)),
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
      landkreisIds: uniq(idsOf(landkreise)),
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
      assignedLocation: { fields: ["id"], populate: { municipality: { fields: ["id"] } } },
      user: { populate: { role: { fields: ["type"] } } },
    },
  });
  const detail = userDetails?.[0];
  if (!detail) return null;
  return { ...detail, roleType: detail.user?.role?.type ?? null };
}

const isGuest = (detail) => detail.roleType === "guest";

/**
 * The municipality a user belongs to: a guest's is the one of their
 * location, everyone else's is the stored one. A non-guest's profile Ort
 * is deliberately not consulted.
 */
function municipalityOfUser(detail) {
  const municipality = detail && (isGuest(detail) ? detail.assignedLocation?.municipality : detail.municipality);
  return municipality ? { id: municipality.id } : null;
}

/**
 * The user's anchor is the only thing that decides their scope: a guest's
 * location, otherwise their municipality, otherwise their landkreis. A
 * non-guest's profile Ort is never an anchor.
 */
function resolveDetailAnchorScope(strapi, detail) {
  if (isGuest(detail)) {
    return detail.assignedLocation ? resolveScope(strapi, { locationId: detail.assignedLocation.id }) : null;
  }
  if (detail.municipality) return resolveScope(strapi, { municipalityId: detail.municipality.id });
  if (detail.landkreis) return resolveScope(strapi, { landkreisId: detail.landkreis.id });
  return null;
}

/**
 * Resolves what a user may see or work in: everything reachable from their
 * anchor (see resolveDetailAnchorScope), all parents and children. Returns
 * null if the user has no anchor (admins with nothing assigned, whom
 * callers bypass anyway) or the anchor record doesn't exist.
 */
async function resolveUserScope(strapi, userId) {
  const detail = await loadUserDetail(strapi, userId);
  if (!detail) return null;
  return resolveDetailAnchorScope(strapi, detail);
}

/**
 * The federal state / landkreis / municipality ids a user belongs to,
 * derived from their anchor. Returns null if there is no anchor.
 */
async function resolveUserAssignedLevels(strapi, userId) {
  const scope = await resolveUserScope(strapi, userId);
  if (!scope) return null;
  const { federalStateIds, landkreisIds, municipalityIds } = scope;
  return { federalStateIds, landkreisIds, municipalityIds };
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
 * Reads the stored anchor levels off a request body, which carries each
 * relation either as `{ id }` or as a bare id. A level that is missing or
 * null comes back as null. A federal state is never stored, so it is not read.
 */
function pickAssignedLevels(source = {}) {
  return {
    landkreisId: idOf(source.landkreis),
    municipalityId: idOf(source.municipality),
    locationId: idOf(source.assignedLocation),
  };
}

/**
 * Checks a user's stored anchor against their role. `roleType` is the
 * Strapi role type: "admin" | "authenticated" | "leader" | "guest".
 *
 * @returns {Promise<null | string>} null when valid, otherwise the German
 *   error message to translate and send back.
 */
async function validateUserLevels(strapi, { roleType, landkreisId, municipalityId, locationId }) {
  if (roleType === "guest") {
    return locationId && !municipalityId && !landkreisId ? null : "Ein*e Gast muss einem Ort zugeordnet sein";
  }

  if (roleType === "admin" && !landkreisId && !municipalityId && !locationId) return null;

  if (Boolean(municipalityId) === Boolean(landkreisId)) {
    return "Bitte weisen Sie dem Benutzer eine Verwaltung oder einen Landkreis zu";
  }
  if (roleType === "leader" && !municipalityId) {
    return "Ein*e Koordinator*in muss einer Verwaltung zugeordnet sein";
  }
  if (locationId) {
    const scope = await resolveScope(strapi, { municipalityId, landkreisId });
    if (!scope?.locationIds.includes(locationId)) return "Der gewählte Ort liegt nicht in Ihrer Verwaltung";
  }
  return null;
}

module.exports = {
  resolveScope,
  resolveUserScope,
  resolveUserAssignedLevels,
  isFundingVisibleToLevels,
  pickAssignedLevels,
  validateUserLevels,
  municipalityOfUser,
};
