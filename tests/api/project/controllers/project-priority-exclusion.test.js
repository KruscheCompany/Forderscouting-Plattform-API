"use strict";

const mockFindMany = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) =>
      cfgFn({ strapi: { entityService: { findMany: mockFindMany } } }),
  },
}));

const projectController = require("../../../../src/api/project/controllers/project.js");

function makeCtx({ userId = 1, role = "admin", query = {} } = {}) {
  return {
    state: { user: { id: userId, role: { type: role } } },
    query,
    unauthorized: jest.fn((msg) => ({ unauthorized: true, msg })),
    throw: jest.fn(),
  };
}

beforeEach(() => {
  mockFindMany.mockReset();
});

describe("getApplicationProcess - prioritized-project exclusion", () => {
  test("adds a $notIn filter with every prioritized project id", async () => {
    const ctx = makeCtx({ role: "admin" });
    mockFindMany
      .mockResolvedValueOnce([
        { project: { id: 11 } },
        { project: { id: 42 } },
      ]) // prioritized-project lookup
      .mockResolvedValueOnce([]); // final project query

    await projectController.getApplicationProcess(ctx);

    const [uid, options] = mockFindMany.mock.calls[1];
    expect(uid).toBe("api::project.project");
    expect(options.filters.$and).toEqual(
      expect.arrayContaining([{ id: { $notIn: [11, 42] } }])
    );
  });

  test("adds no filter when nothing is prioritized anywhere", async () => {
    const ctx = makeCtx({ role: "admin" });
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await projectController.getApplicationProcess(ctx);

    const [, options] = mockFindMany.mock.calls[1];
    const hasNotInFilter = (options.filters.$and || []).some((clause) =>
      Object.prototype.hasOwnProperty.call(clause, "id")
    );
    expect(hasNotInFilter).toBe(false);
  });
});
