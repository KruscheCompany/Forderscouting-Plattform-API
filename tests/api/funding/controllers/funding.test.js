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
    query: {},
    unauthorized: jest.fn((msg) => ({ unauthorized: true, msg })),
  };
}

// The user-detail lookup itself only returns the shallow municipality id now -
// resolveScope() does a separate findOne to fetch that municipality's own
// relations (see municipalityRow() below), so both mocks need queuing per test.
function userDetailRow({ municipalityId = 10 } = {}) {
  return [{ municipality: { id: municipalityId } }];
}

function municipalityRow({ id = 10, federalStateIds = [100] } = {}) {
  return { id, federalStates: federalStateIds.map((fsId) => ({ id: fsId })), landkreise: [], locations: [] };
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

  test("non-admin: cascade shows a landkreis-only funding to a municipality under it", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10 }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [], landkreise: [{ id: 50 }], federalStates: [] }]);
    mockFindOne
      .mockResolvedValueOnce(municipalityRow({ id: 10, federalStateIds: [100] })) // resolveUserScope's own anchor
      .mockResolvedValueOnce({ id: 50, federalStates: [], municipalities: [{ id: 10 }], locations: [] }); // resolveFundingEffectiveScope's landkreis lookup

    const result = await fundingController.find(ctx);

    expect(result.map((f) => f.id)).toEqual([1]);
  });

  test("non-admin: cascade hides a landkreis-only funding for a municipality outside it", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10 }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [], landkreise: [{ id: 50 }], federalStates: [] }]);
    mockFindOne
      .mockResolvedValueOnce(municipalityRow({ id: 10, federalStateIds: [100] }))
      .mockResolvedValueOnce({ id: 50, federalStates: [], municipalities: [{ id: 99 }], locations: [] });

    const result = await fundingController.find(ctx);

    expect(result).toEqual([]);
  });

  test("non-admin: cascade shows a federal-state-only funding to a municipality under it", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10 }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [], landkreise: [], federalStates: [{ id: 100 }] }]);
    mockFindOne
      .mockResolvedValueOnce(municipalityRow({ id: 10, federalStateIds: [100] }))
      .mockResolvedValueOnce({ id: 100, landkreise: [], municipalities: [{ id: 10 }], locations: [] }); // resolveFundingEffectiveScope's federal-state lookup

    const result = await fundingController.find(ctx);

    expect(result.map((f) => f.id)).toEqual([1]);
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
