"use strict";

const mockFindMany = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) =>
      cfgFn({ strapi: { entityService: { findMany: mockFindMany } } }),
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

function userDetailRow({ municipalityId = 10, federalStateIds = [100] } = {}) {
  return [
    {
      municipality: {
        id: municipalityId,
        federalStates: federalStateIds.map((id) => ({ id })),
      },
    },
  ];
}

beforeEach(() => {
  mockFindMany.mockReset();
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

  test("non-admin: query is scoped to the user's federal states", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10, federalStateIds: [100] }))
      .mockResolvedValueOnce([]);

    await fundingController.find(ctx);

    expect(mockFindMany).toHaveBeenCalledTimes(2);
    const [uid, options] = mockFindMany.mock.calls[1];
    expect(uid).toBe("api::funding.funding");
    expect(options.filters.$and).toEqual(
      expect.arrayContaining([{ federalStates: { id: { $in: [100] } } }])
    );
  });

  test("non-admin: keeps state-wide fundings (no municipalities restriction)", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10, federalStateIds: [100] }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [] }, { id: 2 }]);

    const result = await fundingController.find(ctx);

    expect(result.map((f) => f.id)).toEqual([1, 2]);
  });

  test("non-admin: keeps a funding restricted to the user's own municipality", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10, federalStateIds: [100] }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [{ id: 10 }] }]);

    const result = await fundingController.find(ctx);

    expect(result.map((f) => f.id)).toEqual([1]);
  });

  test("non-admin: drops a funding restricted to a different municipality", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10, federalStateIds: [100] }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [{ id: 99 }] }]);

    const result = await fundingController.find(ctx);

    expect(result).toEqual([]);
  });

  test("guest role is scoped the same way as any other non-admin", async () => {
    const ctx = makeCtx({ role: "guest" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10, federalStateIds: [100] }))
      .mockResolvedValueOnce([{ id: 1, municipalities: [{ id: 99 }] }]);

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

describe("funding controller - _getUserMunicipalityScope()", () => {
  test("returns municipalityId and federalStateIds when a municipality is assigned", async () => {
    const ctx = makeCtx();
    mockFindMany.mockResolvedValueOnce(
      userDetailRow({ municipalityId: 42, federalStateIds: [1, 2] })
    );

    const scope = await fundingController._getUserMunicipalityScope(ctx);

    expect(scope).toEqual({ municipalityId: 42, federalStateIds: [1, 2] });
  });

  test("returns null when the user has no municipality assigned", async () => {
    const ctx = makeCtx();
    mockFindMany.mockResolvedValueOnce([{ municipality: null }]);

    const scope = await fundingController._getUserMunicipalityScope(ctx);

    expect(scope).toBeNull();
  });

  test("returns null when there is no user-detail row at all", async () => {
    const ctx = makeCtx();
    mockFindMany.mockResolvedValueOnce([]);

    const scope = await fundingController._getUserMunicipalityScope(ctx);

    expect(scope).toBeNull();
  });
});
