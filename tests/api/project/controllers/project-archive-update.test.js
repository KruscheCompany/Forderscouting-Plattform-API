"use strict";

const mockFindMany = jest.fn();
const mockDbFindOne = jest.fn();
const mockSuperUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) => {
      const base = { update: mockSuperUpdate };
      const own = cfgFn({
        strapi: {
          entityService: { findMany: mockFindMany, delete: mockDelete },
          db: { query: () => ({ findOne: mockDbFindOne, findMany: jest.fn().mockResolvedValue([]) }) },
          log: { info: jest.fn() },
        },
      });
      return Object.setPrototypeOf(own, base);
    },
  },
}));

const projectController = require("../../../../src/api/project/controllers/project.js");

function makeCtx({ data, role = "authenticated", userId = 5 } = {}) {
  return {
    params: { id: 7 },
    state: { user: { id: userId, role: { type: role } } },
    request: { headers: {}, body: { data } },
    forbidden: jest.fn((msg) => ({ forbidden: true, msg })),
    badRequest: jest.fn((msg) => ({ badRequest: true, msg })),
  };
}

const ownedByUser = [{ id: 7, owner: { username: "u" } }];

beforeEach(() => {
  mockFindMany.mockReset();
  mockDbFindOne.mockReset();
  mockSuperUpdate.mockReset();
  mockSuperUpdate.mockResolvedValue({ data: { id: 7 } });
  mockDelete.mockReset();
});

describe("project update - archived key from the edit form", () => {
  test.each([
    ["authenticated", false],
    ["authenticated", true],
    ["guest", false],
  ])("%s user saving with an unchanged archived=%s is a normal edit", async (role, archived) => {
    mockDbFindOne.mockResolvedValueOnce({ archived });
    mockFindMany.mockResolvedValueOnce(ownedByUser);
    const ctx = makeCtx({ role, data: { title: "x", archived } });

    await projectController.update(ctx);

    expect(ctx.forbidden).not.toHaveBeenCalled();
    expect(ctx.request.body.data).not.toHaveProperty("archived");
    expect(mockSuperUpdate).toHaveBeenCalledTimes(1);
  });

  test("a non-leader still cannot archive a project", async () => {
    mockDbFindOne.mockResolvedValueOnce({ archived: false });
    const ctx = makeCtx({ data: { archived: true } });

    const result = await projectController.update(ctx);

    expect(result).toEqual({ forbidden: true, msg: expect.any(String) });
    expect(mockSuperUpdate).not.toHaveBeenCalled();
  });

  test("a non-leader still cannot unarchive a project", async () => {
    mockDbFindOne.mockResolvedValueOnce({ archived: true });
    const ctx = makeCtx({ data: { archived: false } });

    const result = await projectController.update(ctx);

    expect(result).toEqual({ forbidden: true, msg: expect.any(String) });
    expect(mockSuperUpdate).not.toHaveBeenCalled();
  });

  test("a non-leader sending archived for a missing project stays forbidden", async () => {
    mockDbFindOne.mockResolvedValueOnce(null);
    const ctx = makeCtx({ data: { archived: false } });

    const result = await projectController.update(ctx);

    expect(result).toEqual({ forbidden: true, msg: expect.any(String) });
    expect(mockSuperUpdate).not.toHaveBeenCalled();
  });

  test("an update without an archived key never looks up the stored value", async () => {
    mockFindMany.mockResolvedValueOnce(ownedByUser);

    await projectController.update(makeCtx({ data: { title: "x" } }));

    expect(mockDbFindOne).not.toHaveBeenCalled();
    expect(mockSuperUpdate).toHaveBeenCalledTimes(1);
  });

  test("a non-leader who is neither owner nor editor is still blocked on an unchanged archived", async () => {
    mockDbFindOne.mockResolvedValueOnce({ archived: false });
    mockFindMany.mockResolvedValueOnce([]);
    const ctx = makeCtx({ data: { title: "x", archived: false } });

    const result = await projectController.update(ctx);

    expect(result).toEqual({ forbidden: true, msg: expect.any(String) });
    expect(mockSuperUpdate).not.toHaveBeenCalled();
  });

  test("admin archive and unarchive go straight through", async () => {
    mockFindMany.mockResolvedValue([{ id: 7, owner: { username: "u" } }]);

    await projectController.update(makeCtx({ role: "admin", data: { archived: true } }));
    await projectController.update(makeCtx({ role: "admin", data: { archived: false } }));

    expect(mockDbFindOne).not.toHaveBeenCalled();
    expect(mockSuperUpdate).toHaveBeenCalledTimes(2);
  });

  test("a leader keeps the leader path and never needs the stored value", async () => {
    mockFindMany
      .mockResolvedValueOnce([{ id: 7 }])
      .mockResolvedValueOnce([{ id: 7 }]);
    const ctx = makeCtx({ role: "leader", data: { archived: false } });
    jest.spyOn(projectController, "_resolveProjectMunicipalityScope").mockResolvedValue([3]);

    await projectController.update(ctx);

    expect(mockDbFindOne).not.toHaveBeenCalled();
    expect(mockSuperUpdate).toHaveBeenCalledTimes(1);
  });
});
