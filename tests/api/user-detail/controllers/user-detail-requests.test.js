"use strict";

const mockFindMany = jest.fn();
const mockResolveUserScope = jest.fn();

jest.mock("../../../../src/utils/scope-resolver", () => ({
  ...jest.requireActual("../../../../src/utils/scope-resolver"),
  resolveUserScope: (...args) => mockResolveUserScope(...args),
}));

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) =>
      cfgFn({ strapi: { entityService: { findMany: mockFindMany } } }),
  },
}));

const userDetailController = require("../../../../src/api/user-detail/controllers/user-detail.js");

function makeCtx({ userId = 1, role = "leader" } = {}) {
  return {
    state: { user: { id: userId, role: { type: role } } },
  };
}

function userDetailRow({ municipalityId = 10 } = {}) {
  return [{ municipality: { id: municipalityId }, landkreis: null }];
}

beforeEach(() => {
  mockFindMany.mockReset();
  mockResolveUserScope.mockReset();
});

const scopeOf = (locationIds) => ({
  federalStateIds: [],
  landkreisIds: [],
  municipalityIds: [],
  locationIds,
});

describe("user-detail controller - _getRequests() as a leader", () => {
  test("still queries the leader's own guest-approval scope (regression guard)", async () => {
    const ctx = makeCtx({ userId: 7, role: "leader" });
    mockResolveUserScope.mockResolvedValue(scopeOf([1000, 1001]));
    mockFindMany.mockResolvedValueOnce([]); // the requests query itself

    await userDetailController._getRequests(ctx);

    const [uid, options] = mockFindMany.mock.calls[0];
    expect(uid).toBe("api::request.request");
    const orBranches = options.filters.$and[0].$or;
    const guestApprovalCondition = orBranches.find((c) => c.guest === true);
    expect(guestApprovalCondition).toEqual(
      expect.objectContaining({
        guest: true,
        leaderApproved: false,
        user: { user_detail: { assignedLocation: { id: { $in: [1000, 1001] } } } },
      })
    );
  });

  test("leader without scope sees no guest approvals", async () => {
    const ctx = makeCtx({ userId: 7, role: "leader" });
    mockResolveUserScope.mockResolvedValue(null);
    mockFindMany.mockResolvedValueOnce([]);

    await userDetailController._getRequests(ctx);

    const [, options] = mockFindMany.mock.calls[0];
    const guestApprovalCondition = options.filters.$and[0].$or.find((c) => c.guest === true);
    expect(guestApprovalCondition.user).toEqual({ id: { $in: [] } });
  });

  test("leader sees guest approvals for guests whose location is in their municipality", async () => {
    const ctx = makeCtx({ userId: 7, role: "leader" });
    mockResolveUserScope.mockResolvedValue(scopeOf([1000]));
    mockFindMany.mockResolvedValueOnce([]);

    await userDetailController._getRequests(ctx);

    const [, options] = mockFindMany.mock.calls[0];
    const guestApprovalCondition = options.filters.$and[0].$or.find((c) => c.guest === true);
    expect(guestApprovalCondition.user).toEqual({
      user_detail: { assignedLocation: { id: { $in: [1000] } } },
    });
    expect(JSON.stringify(guestApprovalCondition)).not.toContain("municipality");
  });

  test("also includes requests on projects/fundings the leader owns themselves", async () => {
    // Regression test: a leader who owns a project used to never see normal
    // (non-guest) view/edit access requests on it, because this branch replaced
    // the filters entirely instead of adding to them.
    const ctx = makeCtx({ userId: 7, role: "leader" });
    mockResolveUserScope.mockResolvedValue(scopeOf([1000]));
    mockFindMany.mockResolvedValueOnce([]);

    await userDetailController._getRequests(ctx);

    const [, options] = mockFindMany.mock.calls[0];
    const orBranches = options.filters.$and[0].$or;
    const ownRequestsCondition = orBranches.find((c) => c.$and);
    expect(ownRequestsCondition).toBeDefined();

    const [ownershipOr, guestLeaderApprovedOr] = ownRequestsCondition.$and;
    expect(ownershipOr.$or).toEqual(
      expect.arrayContaining([{ project: { owner: 7 } }, { funding: { owner: 7 } }])
    );
    expect(guestLeaderApprovedOr.$or).toEqual(
      expect.arrayContaining([
        { $and: [{ guest: true }, { leaderApproved: true }] },
        { $and: [{ guest: false }, { leaderApproved: false }] },
      ])
    );
  });
});

describe("user-detail controller - _getGuestsRequests() as a leader", () => {
  test("uses the guest's location, derived from the leader's scope", async () => {
    const ctx = makeCtx({ userId: 7, role: "leader" });
    mockResolveUserScope.mockResolvedValue(scopeOf([1000]));
    mockFindMany.mockResolvedValueOnce([]);

    await userDetailController._getGuestsRequests(ctx, "leader", { municipality: { id: 100 } });

    const [uid, options] = mockFindMany.mock.calls[0];
    expect(uid).toBe("api::guest-request.guest-request");
    expect(options.filters.$or[0]).toEqual({ assignedLocation: { id: { $in: [1000] } } });
  });

  test("a leader without scope matches no guest request", async () => {
    const ctx = makeCtx({ userId: 7, role: "leader" });
    mockResolveUserScope.mockResolvedValue(null);
    mockFindMany.mockResolvedValueOnce([]);

    await userDetailController._getGuestsRequests(ctx, "leader", { municipality: null });

    const [, options] = mockFindMany.mock.calls[0];
    expect(options.filters.$or).toEqual([{ assignedLocation: { id: { $in: [] } } }]);
  });

  test("admins are not filtered", async () => {
    const ctx = makeCtx({ userId: 1, role: "admin" });
    mockFindMany.mockResolvedValueOnce([]);

    await userDetailController._getGuestsRequests(ctx, "admin", {});

    const [, options] = mockFindMany.mock.calls[0];
    expect(options.filters).toEqual({});
  });
});
