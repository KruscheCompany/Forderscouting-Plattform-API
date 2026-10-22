"use strict";

const {
  resolveScope,
  resolveUserScope,
  resolveUserAssignedLevels,
  isFundingVisibleToLevels,
  pickAssignedLevels,
  validateUserLevels,
  municipalityOfUser,
} = require("../../src/utils/scope-resolver");

/**
 * Fixture hierarchy - one-level-up links only, no shortcut relations:
 *
 *   state 1 <- landkreis 10 <- municipality 100 <- location 1000
 *   state 2 <- landkreis 20 <- municipality 200 <- location 2000
 *   landkreis 10 and 20 both <- municipality 300 <- location 3000
 *   municipality 400 (no landkreis) <- location 4000
 *
 * The fake strapi ignores `populate`, so each record carries the populated
 * shape the resolver reads.
 */
function makeFakeStrapi({ findOneFixtures = {}, userDetailsByUserId = {} } = {}) {
  return {
    entityService: {
      async findOne(uid, id) {
        const table = findOneFixtures[uid] || {};
        return table[id] ?? null;
      },
      async findMany(uid, opts) {
        if (uid === "api::user-detail.user-detail") {
          const userId = opts.filters.user.id;
          const { roleType, ...detail } = userDetailsByUserId[userId] || {};
          if (!userDetailsByUserId[userId]) return [];
          return [roleType ? { ...detail, user: { id: userId, role: { type: roleType } } } : detail];
        }
        return [];
      },
    },
  };
}

const LANDKREIS_STATES = { 10: [1], 20: [2] };
const MUNICIPALITY_LANDKREISE = { 100: [10], 200: [20], 300: [10, 20], 400: [] };
const LOCATION_MUNICIPALITY = { 1000: 100, 2000: 200, 3000: 300, 4000: 400 };

const refs = (ids) => ids.map((id) => ({ id }));
const idsOf = (records) => records.map((r) => r.id);
const idsWhere = (map, test) => Object.keys(map).map(Number).filter((key) => test(map[key]));

function buildFixtures() {
  const locationsOf = (municipalityId) =>
    refs(idsWhere(LOCATION_MUNICIPALITY, (m) => m === municipalityId));
  const municipalitiesOf = (landkreisId) =>
    idsWhere(MUNICIPALITY_LANDKREISE, (landkreise) => landkreise.includes(landkreisId)).map((id) => ({
      id,
      locations: locationsOf(id),
    }));
  const landkreisWithStates = (id) => ({ id, federalStates: refs(LANDKREIS_STATES[id]) });

  const fixtures = {
    "api::location.location": {},
    "api::municipality.municipality": {},
    "api::landkreis.landkreis": {},
    "api::federal-state.federal-state": {},
  };
  Object.entries(LOCATION_MUNICIPALITY).forEach(([id, municipalityId]) => {
    fixtures["api::location.location"][id] = {
      id: Number(id),
      municipality: {
        id: municipalityId,
        landkreise: MUNICIPALITY_LANDKREISE[municipalityId].map(landkreisWithStates),
      },
    };
  });
  Object.entries(MUNICIPALITY_LANDKREISE).forEach(([id, landkreisIds]) => {
    fixtures["api::municipality.municipality"][id] = {
      id: Number(id),
      landkreise: landkreisIds.map(landkreisWithStates),
      locations: locationsOf(Number(id)),
    };
  });
  Object.entries(LANDKREIS_STATES).forEach(([id, stateIds]) => {
    fixtures["api::landkreis.landkreis"][id] = {
      id: Number(id),
      federalStates: refs(stateIds),
      municipalities: municipalitiesOf(Number(id)),
    };
  });
  [1, 2].forEach((stateId) => {
    fixtures["api::federal-state.federal-state"][stateId] = {
      id: stateId,
      landkreise: idsWhere(LANDKREIS_STATES, (states) => states.includes(stateId)).map((id) => ({
        id,
        municipalities: municipalitiesOf(id),
      })),
    };
  });
  return fixtures;
}

const FIXTURES = buildFixtures();

describe("resolveScope", () => {
  const strapi = makeFakeStrapi({ findOneFixtures: FIXTURES });
  const sorted = (ids) => [...ids].sort((a, b) => a - b);

  test("municipality derives states via its landkreise", async () => {
    expect(await resolveScope(strapi, { municipalityId: 100 })).toEqual({
      federalStateIds: [1],
      landkreisIds: [10],
      municipalityIds: [100],
      locationIds: [1000],
    });
  });

  test("municipality with two landkreise unions both states", async () => {
    const scope = await resolveScope(strapi, { municipalityId: 300 });
    expect(sorted(scope.federalStateIds)).toEqual([1, 2]);
    expect(sorted(scope.landkreisIds)).toEqual([10, 20]);
    expect(scope.municipalityIds).toEqual([300]);
    expect(scope.locationIds).toEqual([3000]);
  });

  test("municipality without landkreis has no federal state", async () => {
    const scope = await resolveScope(strapi, { municipalityId: 400 });
    expect(scope.federalStateIds).toEqual([]);
    expect(scope.landkreisIds).toEqual([]);
    expect(scope.locationIds).toEqual([4000]);
  });

  test("location derives everything via its municipality", async () => {
    expect(await resolveScope(strapi, { locationId: 1000 })).toEqual({
      federalStateIds: [1],
      landkreisIds: [10],
      municipalityIds: [100],
      locationIds: [1000],
    });
  });

  test("location whose municipality has no landkreis still resolves", async () => {
    expect(await resolveScope(strapi, { locationId: 4000 })).toEqual({
      federalStateIds: [],
      landkreisIds: [],
      municipalityIds: [400],
      locationIds: [4000],
    });
  });

  test("location without a municipality resolves to itself only", async () => {
    const lonely = makeFakeStrapi({
      findOneFixtures: { "api::location.location": { 5000: { id: 5000, municipality: null } } },
    });
    expect(await resolveScope(lonely, { locationId: 5000 })).toEqual({
      federalStateIds: [],
      landkreisIds: [],
      municipalityIds: [],
      locationIds: [5000],
    });
  });

  test("landkreis does not borrow states from its municipalities", async () => {
    const landkreis = FIXTURES["api::landkreis.landkreis"][10];
    const withStateShortcut = makeFakeStrapi({
      findOneFixtures: {
        "api::landkreis.landkreis": {
          10: {
            ...landkreis,
            municipalities: landkreis.municipalities.map((m) =>
              m.id === 300 ? { ...m, federalStates: [{ id: 1 }, { id: 2 }] } : m
            ),
          },
        },
      },
    });
    const scope = await resolveScope(withStateShortcut, { landkreisId: 10 });
    expect(scope.federalStateIds).toEqual([1]);
    expect(scope.landkreisIds).toEqual([10]);
    expect(sorted(scope.municipalityIds)).toEqual([100, 300]);
    expect(sorted(scope.locationIds)).toEqual([1000, 3000]);
  });

  test("federal state reaches municipalities through landkreise", async () => {
    const scope = await resolveScope(strapi, { federalStateId: 1 });
    expect(scope.federalStateIds).toEqual([1]);
    expect(scope.landkreisIds).toEqual([10]);
    expect(sorted(scope.municipalityIds)).toEqual([100, 300]);
    expect(sorted(scope.locationIds)).toEqual([1000, 3000]);
  });

  test("a municipality shared by two landkreise is listed once", async () => {
    const scope = await resolveScope(makeFakeStrapi({
      findOneFixtures: {
        "api::federal-state.federal-state": {
          1: {
            id: 1,
            landkreise: [
              { id: 10, municipalities: [{ id: 300, locations: [{ id: 3000 }] }] },
              { id: 20, municipalities: [{ id: 300, locations: [{ id: 3000 }] }] },
            ],
          },
        },
      },
    }), { federalStateId: 1 });
    expect(scope.municipalityIds).toEqual([300]);
    expect(scope.locationIds).toEqual([3000]);
  });

  test("unknown anchor returns null", async () => {
    expect(await resolveScope(strapi, { municipalityId: 999 })).toBeNull();
  });

  test("returns null when no anchor is given at all", async () => {
    expect(await resolveScope(strapi, {})).toBeNull();
  });

  test("prefers the most specific anchor when more than one is given", async () => {
    const scope = await resolveScope(strapi, { municipalityId: 100, landkreisId: 20 });
    expect(scope.municipalityIds).toEqual([100]);
  });
});

describe("user scope", () => {
  const strapiFor = (userDetailsByUserId) => makeFakeStrapi({ findOneFixtures: FIXTURES, userDetailsByUserId });
  const sorted = (ids) => [...ids].sort((a, b) => a - b);

  test("municipality user scope comes from municipality, profile Ort ignored", async () => {
    const strapi = strapiFor({
      1: {
        municipality: { id: 100 },
        assignedLocation: { id: 1000, municipality: { id: 100 } },
        roleType: "authenticated",
      },
    });
    const scope = await resolveUserScope(strapi, 1);
    expect(scope.municipalityIds).toEqual([100]);
    expect(scope.federalStateIds).toEqual([1]);
    expect(scope.locationIds).toEqual([1000]);
  });

  test("the profile Ort of a non-guest never narrows or moves the scope", async () => {
    const strapi = strapiFor({
      1: { municipality: { id: 300 }, assignedLocation: { id: 1000 }, roleType: "authenticated" },
    });
    const scope = await resolveUserScope(strapi, 1);
    expect(scope.municipalityIds).toEqual([300]);
    expect(scope.locationIds).toEqual([3000]);
  });

  test("landkreis-only user scope", async () => {
    const strapi = strapiFor({ 2: { landkreis: { id: 10 }, roleType: "authenticated" } });
    const scope = await resolveUserScope(strapi, 2);
    expect(sorted(scope.municipalityIds)).toEqual([100, 300]);
    expect(scope.landkreisIds).toEqual([10]);
  });

  test("guest scope is location", async () => {
    const strapi = strapiFor({
      3: { roleType: "guest", assignedLocation: { id: 1000, municipality: { id: 100 } } },
    });
    const scope = await resolveUserScope(strapi, 3);
    expect(scope.locationIds).toEqual([1000]);
    expect(scope.federalStateIds).toEqual([1]);
  });

  test("guest location without landkreis", async () => {
    const strapi = strapiFor({
      4: { roleType: "guest", assignedLocation: { id: 4000, municipality: { id: 400 } } },
    });
    const scope = await resolveUserScope(strapi, 4);
    expect(scope.federalStateIds).toEqual([]);
    expect(scope.municipalityIds).toEqual([400]);
    expect(scope.locationIds).toEqual([4000]);
  });

  test("a guest without a location has no scope, even with a stale municipality", async () => {
    const strapi = strapiFor({ 5: { roleType: "guest", municipality: { id: 100 } } });
    expect(await resolveUserScope(strapi, 5)).toBeNull();
  });

  test("a stored federal state is not an anchor", async () => {
    const strapi = strapiFor({ 6: { federalState: { id: 2 }, roleType: "authenticated" } });
    expect(await resolveUserScope(strapi, 6)).toBeNull();
  });

  test("returns null for an admin with nothing assigned", async () => {
    expect(await resolveUserScope(strapiFor({ 7: { roleType: "admin" } }), 7)).toBeNull();
  });

  test("returns null when there is no user-detail record at all", async () => {
    expect(await resolveUserScope(strapiFor({}), 999)).toBeNull();
  });

  test("returns null when the anchor record does not exist", async () => {
    expect(await resolveUserScope(strapiFor({ 8: { municipality: { id: 999 } } }), 8)).toBeNull();
  });
});

describe("resolveUserAssignedLevels", () => {
  const strapiFor = (userDetailsByUserId) => makeFakeStrapi({ findOneFixtures: FIXTURES, userDetailsByUserId });

  test("is the derived scope's three arrays", async () => {
    expect(await resolveUserAssignedLevels(strapiFor({ 1: { municipality: { id: 100 } } }), 1)).toEqual({
      federalStateIds: [1],
      landkreisIds: [10],
      municipalityIds: [100],
    });
  });

  test("ignores stored federalState", async () => {
    const levels = await resolveUserAssignedLevels(
      strapiFor({ 1: { municipality: { id: 100 }, federalState: { id: 2 } } }),
      1
    );
    expect(levels.federalStateIds).toEqual([1]);
  });

  test("ignores a stored landkreis when a municipality is the anchor", async () => {
    const levels = await resolveUserAssignedLevels(
      strapiFor({ 1: { municipality: { id: 100 }, landkreis: { id: 20 } } }),
      1
    );
    expect(levels.landkreisIds).toEqual([10]);
  });

  test("a landkreis-level user is assigned all municipalities under the landkreis", async () => {
    const levels = await resolveUserAssignedLevels(strapiFor({ 2: { landkreis: { id: 20 } } }), 2);
    expect(levels.landkreisIds).toEqual([20]);
    expect(levels.municipalityIds).toEqual([200, 300]);
  });

  test("a guest is assigned the levels of their location", async () => {
    const levels = await resolveUserAssignedLevels(
      strapiFor({ 3: { roleType: "guest", assignedLocation: { id: 1000, municipality: { id: 100 } } } }),
      3
    );
    expect(levels).toEqual({ federalStateIds: [1], landkreisIds: [10], municipalityIds: [100] });
  });

  test("returns null when no level is assigned or there is no user-detail", async () => {
    const strapi = strapiFor({ 3: {} });
    expect(await resolveUserAssignedLevels(strapi, 3)).toBeNull();
    expect(await resolveUserAssignedLevels(strapi, 999)).toBeNull();
  });
});

describe("municipalityOfUser", () => {
  test("a guest's municipality is the one of their location", () => {
    expect(
      municipalityOfUser({
        roleType: "guest",
        municipality: { id: 200 },
        assignedLocation: { id: 1000, municipality: { id: 100 } },
      })
    ).toEqual({ id: 100 });
  });

  test("a non-guest's municipality is the stored one, not their profile Ort's", () => {
    expect(
      municipalityOfUser({
        roleType: "authenticated",
        municipality: { id: 200 },
        assignedLocation: { id: 1000, municipality: { id: 100 } },
      })
    ).toEqual({ id: 200 });
  });

  test("is null when there is nothing to derive it from", () => {
    expect(municipalityOfUser({ roleType: "guest", assignedLocation: { id: 1000 } })).toBeNull();
    expect(municipalityOfUser({ roleType: "guest" })).toBeNull();
    expect(municipalityOfUser({ landkreis: { id: 10 } })).toBeNull();
    expect(municipalityOfUser(null)).toBeNull();
  });
});

describe("isFundingVisibleToLevels", () => {
  const levels = { federalStateIds: [1], landkreisIds: [10], municipalityIds: [100] };

  test("a funding with no level set is visible to nobody", () => {
    expect(isFundingVisibleToLevels({ municipalities: [], landkreise: [], federalStates: [] }, levels)).toBe(false);
    expect(isFundingVisibleToLevels({}, levels)).toBe(false);
  });

  test("municipalities decide on their own - other levels on the funding are ignored", () => {
    const funding = { municipalities: [{ id: 100 }], landkreise: [{ id: 99 }], federalStates: [{ id: 99 }] };
    expect(isFundingVisibleToLevels(funding, levels)).toBe(true);
    expect(isFundingVisibleToLevels({ ...funding, municipalities: [{ id: 101 }] }, levels)).toBe(false);
  });

  test("landkreise decide when there are no municipalities", () => {
    expect(isFundingVisibleToLevels({ landkreise: [{ id: 10 }], federalStates: [{ id: 99 }] }, levels)).toBe(true);
    expect(isFundingVisibleToLevels({ landkreise: [{ id: 11 }], federalStates: [{ id: 1 }] }, levels)).toBe(false);
  });

  test("federal states decide when there are no municipalities or landkreise", () => {
    expect(isFundingVisibleToLevels({ federalStates: [{ id: 1 }] }, levels)).toBe(true);
    expect(isFundingVisibleToLevels({ federalStates: [{ id: 2 }] }, levels)).toBe(false);
  });

  test("one matching entry among several is enough", () => {
    expect(isFundingVisibleToLevels({ landkreise: [{ id: 11 }, { id: 10 }] }, levels)).toBe(true);
  });
});

describe("pickAssignedLevels", () => {
  test("reads levels sent as { id } objects or bare ids, and null for missing ones", () => {
    expect(
      pickAssignedLevels({ federalState: { id: 1 }, landkreis: 10, municipality: { id: 100 }, assignedLocation: null })
    ).toEqual({ landkreisId: 10, municipalityId: 100, locationId: null });
    expect(pickAssignedLevels()).toEqual({ landkreisId: null, municipalityId: null, locationId: null });
  });
});

describe("validateUserLevels", () => {
  const strapi = makeFakeStrapi({ findOneFixtures: FIXTURES });
  const none = { landkreisId: null, municipalityId: null, locationId: null };
  const MISSING_PLACE = "Bitte weisen Sie dem Benutzer eine Verwaltung oder einen Landkreis zu";
  const GUEST_NEEDS_ORT = "Ein*e Gast muss einem Ort zugeordnet sein";
  const LEADER_NEEDS_MUNICIPALITY = "Ein*e Koordinator*in muss einer Verwaltung zugeordnet sein";
  const ORT_OUTSIDE = "Der gewählte Ort liegt nicht in Ihrer Verwaltung";
  const validate = (roleType, levels) => validateUserLevels(strapi, { roleType, ...none, ...levels });

  test("a municipality user is valid, with or without a profile Ort in their municipality", async () => {
    expect(await validate("authenticated", { municipalityId: 100 })).toBeNull();
    expect(await validate("authenticated", { municipalityId: 100, locationId: 1000 })).toBeNull();
  });

  test("a landkreis-only user is valid, and may pick an Ort of any municipality in the landkreis", async () => {
    expect(await validate("authenticated", { landkreisId: 10 })).toBeNull();
    expect(await validate("authenticated", { landkreisId: 10, locationId: 3000 })).toBeNull();
  });

  test("a leader on a municipality is valid", async () => {
    expect(await validate("leader", { municipalityId: 100 })).toBeNull();
  });

  test("a guest on a location is valid", async () => {
    expect(await validate("guest", { locationId: 1000 })).toBeNull();
  });

  test("guest without location", async () => {
    expect(await validate("guest", {})).toBe(GUEST_NEEDS_ORT);
  });

  test("a guest must not also carry a municipality or landkreis", async () => {
    expect(await validate("guest", { locationId: 1000, municipalityId: 100 })).toBe(GUEST_NEEDS_ORT);
    expect(await validate("guest", { locationId: 1000, landkreisId: 10 })).toBe(GUEST_NEEDS_ORT);
  });

  test("non-guest with both municipality and landkreis", async () => {
    expect(await validate("authenticated", { municipalityId: 100, landkreisId: 10 })).toBe(MISSING_PLACE);
  });

  test("non-guest with neither municipality nor landkreis", async () => {
    expect(await validate("authenticated", {})).toBe(MISSING_PLACE);
    expect(await validate("authenticated", { locationId: 1000 })).toBe(MISSING_PLACE);
  });

  test("leader with landkreis only", async () => {
    expect(await validate("leader", { landkreisId: 10 })).toBe(LEADER_NEEDS_MUNICIPALITY);
  });

  test("non-guest Ort outside scope", async () => {
    expect(await validate("authenticated", { municipalityId: 100, locationId: 2000 })).toBe(ORT_OUTSIDE);
    expect(await validate("authenticated", { landkreisId: 10, locationId: 2000 })).toBe(ORT_OUTSIDE);
  });

  test("an Ort whose anchor does not exist is outside scope", async () => {
    expect(await validate("authenticated", { municipalityId: 999, locationId: 1000 })).toBe(ORT_OUTSIDE);
  });

  test("an admin may have nothing assigned", async () => {
    expect(await validate("admin", {})).toBeNull();
  });

  test("an admin that is given a place needs a valid one", async () => {
    expect(await validate("admin", { municipalityId: 100, locationId: 1000 })).toBeNull();
    expect(await validate("admin", { municipalityId: 100, landkreisId: 10 })).toBe(MISSING_PLACE);
    expect(await validate("admin", { municipalityId: 100, locationId: 2000 })).toBe(ORT_OUTSIDE);
  });
});
