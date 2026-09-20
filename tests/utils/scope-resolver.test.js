"use strict";

const {
  resolveScope,
  resolveUserScope,
  resolveFundingEffectiveScope,
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

describe("resolveFundingEffectiveScope", () => {
  const strapi = makeFakeStrapi({ findOneFixtures: FIXTURES });

  test("explicit municipalities win outright - no cascade", async () => {
    const funding = {
      municipalities: [{ id: 100 }],
      landkreise: [{ id: 20 }], // deliberately inconsistent, to prove it's ignored
      federalStates: [],
    };
    const result = await resolveFundingEffectiveScope(strapi, funding);
    expect(result).toEqual({
      effectiveLandkreisIds: [20],
      effectiveMunicipalityIds: [100],
    });
  });

  test("explicit landkreise with no municipalities expands to all municipalities under them", async () => {
    const funding = { municipalities: [], landkreise: [{ id: 10 }], federalStates: [] };
    const result = await resolveFundingEffectiveScope(strapi, funding);
    expect(result.effectiveLandkreisIds).toEqual([10]);
    expect(result.effectiveMunicipalityIds).toEqual([100]);
  });

  test("federal-state-only expands to all landkreise and municipalities under it", async () => {
    const funding = { municipalities: [], landkreise: [], federalStates: [{ id: 1 }] };
    const result = await resolveFundingEffectiveScope(strapi, funding);
    expect(result.effectiveLandkreisIds).toEqual([10]);
    expect(result.effectiveMunicipalityIds).toEqual([100]);
  });

  test("nothing set at all resolves to an empty scope", async () => {
    const funding = { municipalities: [], landkreise: [], federalStates: [] };
    const result = await resolveFundingEffectiveScope(strapi, funding);
    expect(result).toEqual({ effectiveLandkreisIds: [], effectiveMunicipalityIds: [] });
  });

  test("federal-state-only unions across multiple selected federal states", async () => {
    const funding = { municipalities: [], landkreise: [], federalStates: [{ id: 1 }, { id: 2 }] };
    const result = await resolveFundingEffectiveScope(strapi, funding);
    expect(result.effectiveLandkreisIds.sort()).toEqual([10, 20]);
    expect(result.effectiveMunicipalityIds.sort()).toEqual([100, 200]);
  });
});
