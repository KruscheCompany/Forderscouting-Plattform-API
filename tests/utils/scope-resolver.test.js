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
 * Fixture hierarchy used across these tests:
 *
 *   federalState 1
 *     landkreis 10   (federalStates relation left EMPTY on purpose, to
 *                      exercise the "derive via municipalities" fallback)
 *       municipality 100 (federalStates: [1], landkreise: [10])
 *         location 1000  (own federalStates/landkreise left empty, to
 *                          exercise the "derive via municipality" fallback)
 *
 *   federalState 2
 *     landkreis 20   (federalStates: [2], directly linked)
 *       municipality 200 (federalStates: [2], landkreise: [20])
 *         location 2000
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

const FIXTURES = {
  "api::location.location": {
    1000: {
      id: 1000,
      municipality: { id: 100, federalStates: [{ id: 1 }], landkreise: [{ id: 10 }] },
      federalStates: [],
      landkreise: [],
    },
    2000: {
      id: 2000,
      municipality: { id: 200, federalStates: [{ id: 2 }], landkreise: [{ id: 20 }] },
      federalStates: [],
      landkreise: [],
    },
  },
  "api::municipality.municipality": {
    100: { id: 100, federalStates: [{ id: 1 }], landkreise: [{ id: 10 }], locations: [{ id: 1000 }] },
    200: { id: 200, federalStates: [{ id: 2 }], landkreise: [{ id: 20 }], locations: [{ id: 2000 }] },
  },
  "api::landkreis.landkreis": {
    10: {
      id: 10,
      federalStates: [], // left empty on purpose - must fall back to municipalities' federalStates
      municipalities: [{ id: 100, federalStates: [{ id: 1 }], locations: [{ id: 1000 }] }],
      locations: [],
    },
    20: {
      id: 20,
      federalStates: [{ id: 2 }],
      municipalities: [{ id: 200, federalStates: [{ id: 2 }], locations: [{ id: 2000 }] }],
      locations: [],
    },
  },
  "api::federal-state.federal-state": {
    1: { id: 1, landkreise: [{ id: 10 }], municipalities: [{ id: 100 }], locations: [{ id: 1000 }] },
    2: { id: 2, landkreise: [{ id: 20 }], municipalities: [{ id: 200 }], locations: [{ id: 2000 }] },
  },
};

describe("resolveScope", () => {
  const strapi = makeFakeStrapi({ findOneFixtures: FIXTURES });

  test("location anchor derives municipality/landkreis/federalState via its municipality", async () => {
    const scope = await resolveScope(strapi, { locationId: 1000 });
    expect(scope).toEqual({
      federalStateIds: [1],
      landkreisIds: [10],
      municipalityIds: [100],
      locationIds: [1000],
    });
  });

  test("municipality anchor derives its own relations plus its locations", async () => {
    const scope = await resolveScope(strapi, { municipalityId: 100 });
    expect(scope).toEqual({
      federalStateIds: [1],
      landkreisIds: [10],
      municipalityIds: [100],
      locationIds: [1000],
    });
  });

  test("landkreis anchor falls back to municipalities' federalStates when its own relation is empty", async () => {
    const scope = await resolveScope(strapi, { landkreisId: 10 });
    expect(scope.federalStateIds).toEqual([1]);
    expect(scope.municipalityIds).toEqual([100]);
    expect(scope.locationIds).toEqual([1000]);
  });

  test("landkreis anchor uses its own federalStates when directly linked (no fallback needed)", async () => {
    const scope = await resolveScope(strapi, { landkreisId: 20 });
    expect(scope.federalStateIds).toEqual([2]);
  });

  test("federalState anchor derives all landkreise/municipalities/locations under it", async () => {
    const scope = await resolveScope(strapi, { federalStateId: 1 });
    expect(scope).toEqual({
      federalStateIds: [1],
      landkreisIds: [10],
      municipalityIds: [100],
      locationIds: [1000],
    });
  });

  test("returns null when the anchor id doesn't resolve to a real record", async () => {
    expect(await resolveScope(strapi, { municipalityId: 999 })).toBeNull();
  });

  test("returns null when no anchor is given at all", async () => {
    expect(await resolveScope(strapi, {})).toBeNull();
  });

  test("prefers the most specific anchor when more than one is given", async () => {
    // municipalityId (100) should win over landkreisId (20) - location > municipality > landkreis > federalState
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
    expect(scope.municipalityIds).toEqual([200]);
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
    expect(scope.municipalityIds).toEqual([200]);
  });
});

describe("resolveUserAssignedLevels", () => {
  test("uses the explicitly assigned levels as the only id of their level", async () => {
    const strapi = makeFakeStrapi({
      findOneFixtures: {
        ...FIXTURES,
        "api::municipality.municipality": {
          100: { id: 100, federalStates: [{ id: 1 }, { id: 2 }], landkreise: [{ id: 10 }, { id: 20 }], locations: [] },
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
    expect(levels.municipalityIds).toEqual([200]);
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
  const strapi = makeFakeStrapi({ findOneFixtures: FIXTURES });
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
    // landkreis 10 has no federalStates stored (see FIXTURES) - can't tell, so allow
    expect(await areLevelsConsistent(strapi, { ...none, federalStateId: 2, landkreisId: 10 })).toBe(true);
  });
});
