"use strict";

const mockFindMany = jest.fn();
const mockSuperUpdate = jest.fn();
const mockSuperDelete = jest.fn();
const mockEmailSend = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) => {
      const base = { update: mockSuperUpdate, delete: mockSuperDelete };
      const own = cfgFn({
        strapi: {
          entityService: { findMany: mockFindMany },
          plugins: { email: { services: { email: { send: mockEmailSend } } } },
        },
      });
      return Object.setPrototypeOf(own, base);
    },
  },
}));

const requestController = require("../../../src/api/request/controllers/request.js");

function makeCtx() {
  return {
    state: { user: { id: 1, role: { type: "authenticated" } } },
    params: { id: 5 },
    request: { body: { data: { approved: true } } },
    forbidden: jest.fn(),
  };
}

function requestRow(userDetail, roleType = "guest") {
  return [
    {
      approved: false,
      type: "view",
      user: { id: 9, username: "guest", email: "g@example.com", user_detail: userDetail, role: { type: roleType } },
      funding: null,
      project: { id: 3, title: "P" },
    },
  ];
}

beforeEach(() => {
  mockFindMany.mockReset();
  mockSuperUpdate.mockReset();
  mockSuperDelete.mockReset();
  mockEmailSend.mockReset();
  process.env.DEF_FROM = "noreply@example.com";
});

describe("request controller - leader lookup on accepting a request", () => {
  test("request leader lookup uses guest location municipality", async () => {
    mockFindMany
      .mockResolvedValueOnce(requestRow({ fullName: "G", municipality: null, assignedLocation: { id: 1000, municipality: { id: 100 } } }))
      .mockResolvedValueOnce([{ id: 2, username: "leader", email: "l@example.com" }]);
    jest.spyOn(requestController, "acceptProject").mockResolvedValue();

    await requestController.update(makeCtx());

    const requestQuery = mockFindMany.mock.calls[0][1];
    expect(requestQuery.populate.user.populate.user_detail.populate.assignedLocation).toBeDefined();

    const [uid, leaderQuery] = mockFindMany.mock.calls[1];
    expect(uid).toBe("plugin::users-permissions.user");
    expect(leaderQuery.filters).toEqual({
      role: { type: "leader" },
      user_detail: { municipality: { id: 100 } },
    });
    expect(requestController.acceptProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [{ id: 2, username: "leader", email: "l@example.com" }]
    );
  });

  test("ignores a legacy stored municipality on a guest", async () => {
    mockFindMany
      .mockResolvedValueOnce(
        requestRow({ municipality: { id: 999 }, assignedLocation: { id: 1000, municipality: { id: 100 } } })
      )
      .mockResolvedValueOnce([]);
    jest.spyOn(requestController, "acceptProject").mockResolvedValue();

    await requestController.update(makeCtx());

    expect(mockFindMany.mock.calls[1][1].filters.user_detail).toEqual({ municipality: { id: 100 } });
  });

  test("a non-guest requester is looked up by their own municipality", async () => {
    mockFindMany
      .mockResolvedValueOnce(requestRow({ municipality: { id: 50 }, assignedLocation: null }, "authenticated"))
      .mockResolvedValueOnce([]);
    jest.spyOn(requestController, "acceptProject").mockResolvedValue();

    await requestController.update(makeCtx());

    expect(mockFindMany.mock.calls[1][1].filters.user_detail).toEqual({ municipality: { id: 50 } });
  });

  test("a requester without a municipality has no leader lookup", async () => {
    mockFindMany.mockResolvedValueOnce(requestRow({ municipality: null, landkreis: { id: 10 }, assignedLocation: null }, "authenticated"));
    jest.spyOn(requestController, "acceptProject").mockResolvedValue();

    await requestController.update(makeCtx());

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(requestController.acceptProject).toHaveBeenCalledWith(expect.anything(), expect.anything(), []);
  });
});
