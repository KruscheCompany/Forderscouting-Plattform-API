"use strict";

const mockDbFindOne = jest.fn();
const mockSuperUpdate = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) => {
      const base = { update: mockSuperUpdate };
      const own = cfgFn({
        strapi: {
          entityService: { findMany: jest.fn().mockResolvedValue([{ id: 7, owner: { username: "u" } }]) },
          db: { query: () => ({ findOne: mockDbFindOne, findMany: jest.fn().mockResolvedValue([]) }) },
          log: { info: jest.fn() },
        },
      });
      return Object.setPrototypeOf(own, base);
    },
  },
}));

const projectController = require("../../../../src/api/project/controllers/project.js");

const makeCtx = (data) => ({
  params: { id: 7 },
  state: { user: { id: 1, role: { type: "admin" } } },
  request: { headers: {}, body: { data } },
  forbidden: jest.fn(),
  badRequest: jest.fn((msg) => ({ badRequest: true, msg })),
});

beforeEach(() => {
  mockDbFindOne.mockReset();
  mockSuperUpdate.mockReset();
  mockSuperUpdate.mockResolvedValue({ data: { id: 7 } });
});

describe("project update - project status", () => {
  test("is refused while the project has no application status", async () => {
    mockDbFindOne.mockResolvedValue({ status: null });

    const result = await projectController.update(makeCtx({ projectStatus: "completed" }));

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockSuperUpdate).not.toHaveBeenCalled();
  });

  test("is accepted in the same save that sets the application status", async () => {
    mockDbFindOne.mockResolvedValue({ status: null });

    const result = await projectController.update(
      makeCtx({ status: "grantNotice", projectStatus: "inImplementation" })
    );

    expect(result).toEqual({ data: { id: 7 } });
    expect(mockSuperUpdate).toHaveBeenCalled();
  });

  test("is accepted when the project already has an application status", async () => {
    mockDbFindOne.mockResolvedValue({ status: "sentToFunding" });

    const result = await projectController.update(makeCtx({ projectStatus: "stoppedOrPostponed" }));

    expect(result).toEqual({ data: { id: 7 } });
  });

  test("is refused when the same save clears the application status", async () => {
    mockDbFindOne.mockResolvedValue({ status: "grantNotice" });

    const result = await projectController.update(makeCtx({ status: null, projectStatus: "completed" }));

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
  });

  test("clearing the project status needs no application status", async () => {
    mockDbFindOne.mockResolvedValue({ status: null });

    const result = await projectController.update(makeCtx({ projectStatus: null }));

    expect(result).toEqual({ data: { id: 7 } });
  });
});
