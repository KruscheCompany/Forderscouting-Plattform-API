"use strict";

const mockFindMany = jest.fn();
const mockFindOne = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) =>
      cfgFn({ strapi: { entityService: { findMany: mockFindMany, findOne: mockFindOne } } }),
  },
}));

const fundingController = require("../../../../src/api/funding/controllers/funding.js");

function makeCtx({ userId = 1, role = "authenticated" } = {}) {
  return {
    state: { user: { id: userId, role: { type: role } } },
    request: { headers: {} },
    query: {},
    unauthorized: jest.fn((msg) => ({ unauthorized: true, msg })),
  };
}

// The user-detail lookup only returns the shallow ids of the levels assigned to
// the user - resolveScope() does a separate findOne to fetch the anchor's own
// relations (see municipalityRow() below), so both mocks need queuing per test.
function userDetailRow({ municipalityId = 10, landkreisId = null, federalStateId = null } = {}) {
  return [
    {
      municipality: { id: municipalityId },
      landkreis: landkreisId ? { id: landkreisId } : null,
      federalState: federalStateId ? { id: federalStateId } : null,
    },
  ];
}

function municipalityRow({ id = 10, federalStateIds = [100], landkreisIds = [] } = {}) {
  return {
    id,
    federalStates: federalStateIds.map((fsId) => ({ id: fsId })),
    landkreise: landkreisIds.map((lkId) => ({ id: lkId })),
    locations: [],
  };
}

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindOne.mockReset();
});

describe("funding controller - find()", () => {
  test("non-admin without a municipality is unauthorized and never queries fundings", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany.mockResolvedValueOnce([]); // user-detail lookup -> no rows

    const result = await fundingController.find(ctx);

    expect(ctx.unauthorized).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ unauthorized: true, msg: expect.any(String) });
    expect(mockFindMany).toHaveBeenCalledTimes(1); // only the user-detail lookup, no funding query
  });

  test("non-admin: no DB-level federalStates pre-filter is added (cascade decides in JS)", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10 }))
      .mockResolvedValueOnce([]);
    mockFindOne.mockResolvedValueOnce(municipalityRow({ id: 10, federalStateIds: [100] }));

    await fundingController.find(ctx);

    expect(mockFindMany).toHaveBeenCalledTimes(2);
    const [uid, options] = mockFindMany.mock.calls[1];
    expect(uid).toBe("api::funding.funding");
    const hasFederalStateFilter = (options.filters.$and || []).some(
      (clause) => Object.prototype.hasOwnProperty.call(clause, "federalStates")
    );
    expect(hasFederalStateFilter).toBe(false);
  });

  test("non-admin: a landkreis-only funding is shown to a user assigned to that landkreis", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10, landkreisId: 50 }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [], landkreise: [{ id: 50 }], federalStates: [] }]);
    mockFindOne.mockResolvedValueOnce(municipalityRow({ id: 10, landkreisIds: [50, 60] }));

    const result = await fundingController.find(ctx);

    expect(result.map((f) => f.id)).toEqual([1]);
  });

  test("non-admin: a landkreis-only funding is hidden from a user whose municipality lies in it but who is assigned to another landkreis", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10, landkreisId: 60 }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [], landkreise: [{ id: 50 }], federalStates: [] }]);
    mockFindOne.mockResolvedValueOnce(municipalityRow({ id: 10, landkreisIds: [50, 60] }));

    const result = await fundingController.find(ctx);

    expect(result).toEqual([]);
  });

  test("non-admin: a user with no landkreis assigned falls back to the landkreise of their municipality", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10 }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [], landkreise: [{ id: 50 }], federalStates: [] }]);
    mockFindOne.mockResolvedValueOnce(municipalityRow({ id: 10, landkreisIds: [50] }));

    const result = await fundingController.find(ctx);

    expect(result.map((f) => f.id)).toEqual([1]);
  });

  test("non-admin: a federal-state-only funding is shown to a user assigned to that federal state", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10, federalStateId: 100 }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [], landkreise: [], federalStates: [{ id: 100 }] }]);
    mockFindOne.mockResolvedValueOnce(municipalityRow({ id: 10, federalStateIds: [100, 200] }));

    const result = await fundingController.find(ctx);

    expect(result.map((f) => f.id)).toEqual([1]);
  });

  test("non-admin: a federal-state-only funding is hidden when the user is assigned to the municipality's other federal state", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10, federalStateId: 200 }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [], landkreise: [], federalStates: [{ id: 100 }] }]);
    mockFindOne.mockResolvedValueOnce(municipalityRow({ id: 10, federalStateIds: [100, 200] }));

    const result = await fundingController.find(ctx);

    expect(result).toEqual([]);
  });

  test("non-admin: keeps state-wide fundings (no municipalities restriction)", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10 }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [] }, { id: 2 }]);
    mockFindOne.mockResolvedValueOnce(municipalityRow({ id: 10, federalStateIds: [100] }));

    const result = await fundingController.find(ctx);

    expect(result.map((f) => f.id)).toEqual([1, 2]);
  });

  test("non-admin: keeps a funding restricted to the user's own municipality", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10 }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [{ id: 10 }] }]);
    mockFindOne.mockResolvedValueOnce(municipalityRow({ id: 10, federalStateIds: [100] }));

    const result = await fundingController.find(ctx);

    expect(result.map((f) => f.id)).toEqual([1]);
  });

  test("non-admin: drops a funding restricted to a different municipality", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10 }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [{ id: 99 }] }]);
    mockFindOne.mockResolvedValueOnce(municipalityRow({ id: 10, federalStateIds: [100] }));

    const result = await fundingController.find(ctx);

    expect(result).toEqual([]);
  });

  test("guest role is scoped the same way as any other non-admin", async () => {
    const ctx = makeCtx({ role: "guest" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10 }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [{ id: 99 }] }]);
    mockFindOne.mockResolvedValueOnce(municipalityRow({ id: 10, federalStateIds: [100] }));

    const result = await fundingController.find(ctx);

    expect(result).toEqual([]);
  });

  test("admin: no federalStates filter is added and no municipality post-filter is applied", async () => {
    const ctx = makeCtx({ role: "admin" });
    const allFundings = [
      { id: 1, municipalities: [{ id: 99 }] },
      { id: 2, municipalities: [] },
    ];
    mockFindMany.mockResolvedValueOnce(allFundings);

    const result = await fundingController.find(ctx);

    // only one call: the funding query itself, no user-detail lookup for admins
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const [uid, options] = mockFindMany.mock.calls[0];
    expect(uid).toBe("api::funding.funding");
    const hasFederalStateFilter = (options.filters.$and || []).some(
      (clause) => Object.prototype.hasOwnProperty.call(clause, "federalStates")
    );
    expect(hasFederalStateFilter).toBe(false);
    expect(result).toEqual(allFundings);
  });
});

// _getUserMunicipalityScope() was consolidated into the shared
// resolveUserScope()/resolveScope() service (see the admin-hierarchy overhaul
// plan, section 3) - equivalent coverage now lives in
// tests/utils/scope-resolver.test.js instead of against this controller's
// (now-removed) private helper.

describe("funding controller - proxyGetFundingQuestions()", () => {
  const ENV = { ...process.env };
  afterAll(() => {
    process.env = ENV;
  });

  test.each(["undefined", "null", ""])("a funding id of %p is a bad request, never proxied", async (fundingId) => {
    process.env.AI_ENDPOINT = "https://ai.example.com";
    process.env.AI_ENDPOINT_KEY = "key";
    const ctx = {
      ...makeCtx(),
      params: { fundingId },
      request: { headers: {}, body: { goals: "x" } },
      badRequest: jest.fn((msg) => ({ badRequest: true, msg })),
    };

    const result = await fundingController.proxyGetFundingQuestions(ctx);

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
  });
});
