"use strict";

const mockFindMany = jest.fn();

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
});

describe("user-detail controller - _getRequests() as a leader", () => {
  test("still queries the leader's own guest-approval scope (regression guard)", async () => {
    const ctx = makeCtx({ userId: 7, role: "leader" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10 })) // this.find(ctx) -> leader's own scope
      .mockResolvedValueOnce([]); // the requests query itself

    await userDetailController._getRequests(ctx);

    const [uid, options] = mockFindMany.mock.calls[1];
    expect(uid).toBe("api::request.request");
    const orBranches = options.filters.$and[0].$or;
    const guestApprovalCondition = orBranches.find((c) => c.guest === true);
    expect(guestApprovalCondition).toEqual(
      expect.objectContaining({
        guest: true,
        leaderApproved: false,
        user: { user_detail: { municipality: { id: 10 } } },
      })
    );
  });

  test("also includes requests on projects/fundings the leader owns themselves", async () => {
    // Regression test: a leader who owns a project used to never see normal
    // (non-guest) view/edit access requests on it, because this branch replaced
    // the filters entirely instead of adding to them.
    const ctx = makeCtx({ userId: 7, role: "leader" });
    mockFindMany
      .mockResolvedValueOnce(userDetailRow({ municipalityId: 10 }))
      .mockResolvedValueOnce([]);

    await userDetailController._getRequests(ctx);

    const [, options] = mockFindMany.mock.calls[1];
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
