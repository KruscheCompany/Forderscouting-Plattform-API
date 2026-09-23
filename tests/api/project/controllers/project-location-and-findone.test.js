"use strict";

const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockGetContactPersonInfo = jest.fn();
const mockSuperCreate = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) => {
      const base = { create: mockSuperCreate };
      const own = cfgFn({
        strapi: {
          entityService: { findMany: mockFindMany },
          db: { query: () => ({ count: mockCount }) },
          controller: () => ({ getContactPersonInfo: mockGetContactPersonInfo }),
        },
      });
      return Object.setPrototypeOf(own, base);
    },
  },
}));

const projectController = require("../../../../src/api/project/controllers/project.js");

function makeCtx({ body, params = {}, role = "authenticated", userId = 1 } = {}) {
  return {
    params,
    state: { user: { id: userId, role: { type: role } } },
    request: { headers: {}, body },
    badRequest: jest.fn((msg) => ({ badRequest: true, msg })),
    unauthorized: jest.fn((msg) => ({ unauthorized: true, msg })),
  };
}

beforeEach(() => {
  mockFindMany.mockReset();
  mockCount.mockReset();
  mockCount.mockResolvedValue(0);
  mockGetContactPersonInfo.mockReset();
  mockSuperCreate.mockReset();
});

describe("project create/update - the Ort is required", () => {
  test.each([
    ["missing", undefined],
    ["null", null],
    ["an unlinked legacy location", { id: null, title: "Musterdorf" }],
  ])("create with a %s location is a bad request", async (_label, location) => {
    const result = await projectController.create(makeCtx({ body: { data: { title: "x", location } } }));

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockSuperCreate).not.toHaveBeenCalled();
  });

  test.each([
    ["an id", 5],
    ["an object with an id", { id: 5 }],
    ["a connect list", { connect: [{ id: 5 }] }],
  ])("create with %s passes through", async (_label, location) => {
    mockSuperCreate.mockResolvedValueOnce({ data: { id: 1 } });

    await projectController.create(makeCtx({ body: { data: { title: "x", location } } }));

    expect(mockSuperCreate).toHaveBeenCalled();
  });

  test("update sending an unlinked location is a bad request, not a 500", async () => {
    const result = await projectController.update(
      makeCtx({ params: { id: 7 }, body: { data: { location: { id: null, title: "Musterdorf" } } } })
    );

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  test("update that does not touch the location is not blocked by the check", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await projectController.update(
      makeCtx({ params: { id: 7 }, body: { data: { fundingCheckSteps: [] } } })
    );

    expect(result).toEqual({ unauthorized: true, msg: expect.any(String) });
  });
});

describe("project findOne - incomplete records", () => {
  test("a project without an info component or owner details still loads", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 7, info: null, owner: { id: 3, user_detail: null } }]);

    const result = await projectController.findOne(makeCtx({ params: { id: 7 }, role: "admin" }));

    expect(result.info).toEqual({ location: null });
    expect(mockGetContactPersonInfo).not.toHaveBeenCalled();
  });

  test("the contact details come from the owner and keep the project's location", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 7, info: { location: "Musterdorf" }, owner: { id: 3, user_detail: { id: 30 } } },
    ]);
    mockGetContactPersonInfo.mockResolvedValueOnce({ contactName: "A" });

    const result = await projectController.findOne(makeCtx({ params: { id: 7 }, role: "admin" }));

    expect(mockGetContactPersonInfo).toHaveBeenCalledWith(expect.anything(), 30);
    expect(result.info).toEqual({ contactName: "A", location: "Musterdorf" });
  });
});
