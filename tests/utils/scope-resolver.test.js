"use strict";

const {
  resolveScope,
  resolveUserScope,
  resolveUserAssignedLevels,
  isFundingVisibleToLevels,
  pickAssignedLevels,
  areLevelsConsistent,
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
          const detail = userDetailsByUserId[userId];
          return detail ? [detail] : [];
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

describe("resolveUserScope", () => {
  test("resolves via the user's municipality when set", async () => {
    const strapi = makeFakeStrapi({
      findOneFixtures: FIXTURES,
      userDetailsByUserId: { 1: { municipality: { id: 100 } } },
    });
    const scope = await resolveUserScope(strapi, 1);
    expect(scope.municipalityIds).toEqual([100]);
    expect(scope.federalStateIds).toEqual([1]);
  });

  test("resolves via the user's landkreis when municipality isn't set", async () => {
    const strapi = makeFakeStrapi({
      findOneFixtures: FIXTURES,
      userDetailsByUserId: { 2: { landkreis: { id: 20 } } },
    });
    const scope = await resolveUserScope(strapi, 2);
    expect(scope.municipalityIds).toEqual([200, 300]);
  });

  test("resolves via the user's assignedLocation, taking precedence over municipality/landkreis", async () => {
    const strapi = makeFakeStrapi({
      findOneFixtures: FIXTURES,
      userDetailsByUserId: {
        4: { assignedLocation: { id: 1000 }, municipality: { id: 200 } },
      },
    });
    const scope = await resolveUserScope(strapi, 4);
    expect(scope.locationIds).toEqual([1000]);
    expect(scope.municipalityIds).toEqual([100]); // derived from location 1000, not the stale municipality 200
  });

  test("returns null when the user has neither municipality nor landkreis", async () => {
    const strapi = makeFakeStrapi({
      findOneFixtures: FIXTURES,
      userDetailsByUserId: { 3: {} },
    });
    expect(await resolveUserScope(strapi, 3)).toBeNull();
  });

  test("returns null when there is no user-detail record at all", async () => {
    const strapi = makeFakeStrapi({ findOneFixtures: FIXTURES, userDetailsByUserId: {} });
    expect(await resolveUserScope(strapi, 999)).toBeNull();
  });
});

describe("resolveUserScope - federal state anchor", () => {
  test("resolves via the user's federal state when nothing more specific is set", async () => {
    const strapi = makeFakeStrapi({
      findOneFixtures: FIXTURES,
      userDetailsByUserId: { 5: { federalState: { id: 2 } } },
    });
    const scope = await resolveUserScope(strapi, 5);
    expect(scope.federalStateIds).toEqual([2]);
    expect(scope.municipalityIds).toEqual([200, 300]);
  });
});

describe("resolveUserAssignedLevels", () => {
  test("uses the explicitly assigned levels as the only id of their level", async () => {
    const strapi = makeFakeStrapi({
      findOneFixtures: {
        ...FIXTURES,
        "api::municipality.municipality": {
          100: {
            id: 100,
            landkreise: [
              { id: 10, federalStates: [{ id: 1 }] },
              { id: 20, federalStates: [{ id: 2 }] },
            ],
            locations: [],
          },
        },
      },
      userDetailsByUserId: {
        1: { municipality: { id: 100 }, landkreis: { id: 20 }, federalState: { id: 2 } },
      },
    });
    expect(await resolveUserAssignedLevels(strapi, 1)).toEqual({
      federalStateIds: [2],
      landkreisIds: [20],
      municipalityIds: [100],
    });
  });

  test("a level that was never assigned falls back to everything reachable from the anchor", async () => {
    const strapi = makeFakeStrapi({
      findOneFixtures: FIXTURES,
      userDetailsByUserId: { 1: { municipality: { id: 100 } } },
    });
    expect(await resolveUserAssignedLevels(strapi, 1)).toEqual({
      federalStateIds: [1],
      landkreisIds: [10],
      municipalityIds: [100],
    });
  });

  test("a landkreis-level user is assigned all municipalities under the landkreis", async () => {
    const strapi = makeFakeStrapi({
      findOneFixtures: FIXTURES,
      userDetailsByUserId: { 2: { landkreis: { id: 20 } } },
    });
    const levels = await resolveUserAssignedLevels(strapi, 2);
    expect(levels.landkreisIds).toEqual([20]);
    expect(levels.municipalityIds).toEqual([200, 300]);
  });

  test("returns null when no level is assigned or there is no user-detail", async () => {
    const strapi = makeFakeStrapi({ findOneFixtures: FIXTURES, userDetailsByUserId: { 3: {} } });
    expect(await resolveUserAssignedLevels(strapi, 3)).toBeNull();
    expect(await resolveUserAssignedLevels(strapi, 999)).toBeNull();
  });
});

describe("isFundingVisibleToLevels", () => {
  const levels = { federalStateIds: [1], landkreisIds: [10], municipalityIds: [100] };

  test("a funding with no level set is visible to everyone", () => {
    expect(isFundingVisibleToLevels({ municipalities: [], landkreise: [], federalStates: [] }, levels)).toBe(true);
    expect(isFundingVisibleToLevels({}, levels)).toBe(true);
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
    ).toEqual({ federalStateId: 1, landkreisId: 10, municipalityId: 100, locationId: null });
    expect(pickAssignedLevels()).toEqual({
      federalStateId: null,
      landkreisId: null,
      municipalityId: null,
      locationId: null,
    });
  });
});

describe("areLevelsConsistent", () => {
  // areLevelsConsistent still reads the shortcut relations (reworked later), so
  // layer them onto the chain-only fixtures: municipalities carry federalStates
  // and landkreis 10 has none stored.
  const strapi = makeFakeStrapi({
    findOneFixtures: {
      ...FIXTURES,
      "api::municipality.municipality": Object.fromEntries(
        Object.entries(FIXTURES["api::municipality.municipality"]).map(([id, m]) => [
          id,
          { ...m, federalStates: refs(idsOf(m.landkreise.flatMap((lk) => lk.federalStates))) },
        ])
      ),
      "api::landkreis.landkreis": {
        ...FIXTURES["api::landkreis.landkreis"],
        10: { ...FIXTURES["api::landkreis.landkreis"][10], federalStates: [] },
      },
    },
  });
  const none = { federalStateId: null, landkreisId: null, municipalityId: null, locationId: null };

  test("accepts a chain whose levels belong together", async () => {
    expect(
      await areLevelsConsistent(strapi, { federalStateId: 1, landkreisId: 10, municipalityId: 100, locationId: 1000 })
    ).toBe(true);
  });

  test("accepts a single level", async () => {
    expect(await areLevelsConsistent(strapi, { ...none, municipalityId: 100 })).toBe(true);
    expect(await areLevelsConsistent(strapi, none)).toBe(true);
  });

  test("rejects a municipality that is not in the chosen landkreis", async () => {
    expect(await areLevelsConsistent(strapi, { ...none, landkreisId: 20, municipalityId: 100 })).toBe(false);
  });

  test("rejects a municipality that is not in the chosen federal state", async () => {
    expect(await areLevelsConsistent(strapi, { ...none, federalStateId: 2, municipalityId: 100 })).toBe(false);
  });

  test("rejects a landkreis that is not in the chosen federal state", async () => {
    expect(await areLevelsConsistent(strapi, { ...none, federalStateId: 1, landkreisId: 20 })).toBe(false);
  });

  test("rejects a location that belongs to a different municipality", async () => {
    expect(await areLevelsConsistent(strapi, { ...none, municipalityId: 200, locationId: 1000 })).toBe(false);
  });

  test("an empty parent list in the data is not a contradiction", async () => {
    // landkreis 10 has no federalStates stored (see the fixtures above) - can't tell, so allow
    expect(await areLevelsConsistent(strapi, { ...none, federalStateId: 2, landkreisId: 10 })).toBe(true);
  });
});
