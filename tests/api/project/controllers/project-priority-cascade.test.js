"use strict";

const mockFindMany = jest.fn();
const mockDelete = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) =>
      cfgFn({ strapi: { entityService: { findMany: mockFindMany, delete: mockDelete } } }),
  },
}));

const projectController = require("../../../../src/api/project/controllers/project.js");

beforeEach(() => {
  mockFindMany.mockReset();
  mockDelete.mockReset();
});

describe("_cascadeDeletePrioritizedEntry", () => {
  test("deletes every prioritized-project row referencing the project", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    await projectController._cascadeDeletePrioritizedEntry(77);

    expect(mockFindMany).toHaveBeenCalledWith(
      "api::prioritized-project.prioritized-project",
      { filters: { project: { id: 77 } }, fields: ["id"] }
    );
    expect(mockDelete).toHaveBeenNthCalledWith(1, "api::prioritized-project.prioritized-project", 1);
    expect(mockDelete).toHaveBeenNthCalledWith(2, "api::prioritized-project.prioritized-project", 2);
  });

  test("no-op when nothing references the project", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await projectController._cascadeDeletePrioritizedEntry(77);

    expect(mockDelete).not.toHaveBeenCalled();
  });
});
