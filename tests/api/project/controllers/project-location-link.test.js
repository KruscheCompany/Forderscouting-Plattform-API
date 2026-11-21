"use strict";

const mockFindMany = jest.fn();
const mockFindOne = jest.fn();
const mockEntityUpdate = jest.fn();
const mockDbFindOne = jest.fn();
const mockSuperCreate = jest.fn();
const mockSuperUpdate = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) => {
      const base = { create: mockSuperCreate, update: mockSuperUpdate };
      const own = cfgFn({
        strapi: {
          entityService: { findMany: mockFindMany, findOne: mockFindOne, update: mockEntityUpdate },
          db: { query: () => ({ findOne: mockDbFindOne, findMany: jest.fn().mockResolvedValue([]) }) },
          log: { info: jest.fn() },
        },
      });
      return Object.setPrototypeOf(own, base);
    },
  },
}));

const projectController = require("../../../../src/api/project/controllers/project.js");

const MUNICIPALITY_ID = 74;
const IN_SCOPE_LOCATION = 406;
const OUT_OF_SCOPE_LOCATION = 500;

function makeCtx({ data, role = "leader", userId = 377, params = {} } = {}) {
  return {
    params,
    state: { user: { id: userId, role: { type: role } } },
    request: { headers: {}, body: { data } },
    forbidden: jest.fn((msg) => ({ forbidden: true, msg })),
    badRequest: jest.fn((msg) => ({ badRequest: true, msg })),
  };
}

// resolveUserScope: user-detail lookup, then the municipality with its locations
function mockUserInMunicipality() {
  mockFindMany.mockImplementation(async (uid) => {
    if (uid === "api::user-detail.user-detail") {
      return [{ id: 1, municipality: { id: MUNICIPALITY_ID }, user: { role: { type: "leader" } } }];
    }
    return [{ id: 7, owner: { username: "u" } }];
  });
  mockFindOne.mockResolvedValue({
    id: MUNICIPALITY_ID,
    landkreise: [],
    locations: [{ id: IN_SCOPE_LOCATION }, { id: 407 }],
  });
}

beforeEach(() => {
  [mockFindMany, mockFindOne, mockEntityUpdate, mockDbFindOne, mockSuperCreate, mockSuperUpdate].forEach((m) =>
    m.mockReset()
  );
  mockSuperCreate.mockResolvedValue({ data: { id: 718 } });
  mockSuperUpdate.mockResolvedValue({ data: { id: 718 } });
  mockUserInMunicipality();
});

const locationLinks = () =>
  mockEntityUpdate.mock.calls.filter(([uid, , opts]) => uid === "api::project.project" && "location" in opts.data);

describe("project create - the Ort is linked by the controller", () => {
  test.each([
    ["an object", { id: IN_SCOPE_LOCATION, title: "Münsterdorf" }],
    ["a bare id", IN_SCOPE_LOCATION],
    ["a connect list", { connect: [{ id: IN_SCOPE_LOCATION }] }],
  ])("a leader's in-scope Ort sent as %s is kept off the body and linked after create", async (_l, location) => {
    const ctx = makeCtx({ data: { title: "x", location } });

    await projectController.create(ctx);

    expect(ctx.request.body.data).not.toHaveProperty("location");
    expect(mockEntityUpdate).toHaveBeenCalledWith("api::project.project", 718, {
      data: { location: IN_SCOPE_LOCATION },
    });
  });

  test("an Ort outside the user's scope is forbidden and nothing is created", async () => {
    const ctx = makeCtx({ data: { title: "x", location: { id: OUT_OF_SCOPE_LOCATION } } });

    const result = await projectController.create(ctx);

    expect(result).toEqual({ forbidden: true, msg: expect.any(String) });
    expect(mockSuperCreate).not.toHaveBeenCalled();
    expect(mockEntityUpdate).not.toHaveBeenCalled();
  });

  test("an admin may pick any Ort without a scope lookup", async () => {
    const ctx = makeCtx({ role: "admin", data: { title: "x", location: { id: OUT_OF_SCOPE_LOCATION } } });

    await projectController.create(ctx);

    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockEntityUpdate).toHaveBeenCalledWith("api::project.project", 718, {
      data: { location: OUT_OF_SCOPE_LOCATION },
    });
  });
});

describe("project update - the Ort is linked by the controller", () => {
  test("a leader changing the Ort to an in-scope one links it after the save", async () => {
    mockDbFindOne.mockResolvedValue({ id: 718, location: null, archived: false });
    const ctx = makeCtx({ params: { id: 718 }, data: { title: "x", location: { id: IN_SCOPE_LOCATION, title: "M" } } });

    await projectController.update(ctx);

    expect(ctx.request.body.data).not.toHaveProperty("location");
    expect(mockSuperUpdate).toHaveBeenCalledTimes(1);
    expect(locationLinks()).toEqual([
      ["api::project.project", 718, { data: { location: IN_SCOPE_LOCATION } }],
    ]);
  });

  test("an authenticated owner is treated the same way", async () => {
    mockDbFindOne.mockResolvedValue({ id: 718, location: null, archived: false });
    const ctx = makeCtx({
      role: "authenticated",
      params: { id: 718 },
      data: { title: "x", location: { id: IN_SCOPE_LOCATION } },
    });

    await projectController.update(ctx);

    expect(locationLinks()).toHaveLength(1);
  });

  test("an out-of-scope Ort is forbidden before anything is saved", async () => {
    mockDbFindOne.mockResolvedValue({ id: 718, location: null, archived: false });
    const ctx = makeCtx({ params: { id: 718 }, data: { location: { id: OUT_OF_SCOPE_LOCATION } } });

    const result = await projectController.update(ctx);

    expect(result).toEqual({ forbidden: true, msg: expect.any(String) });
    expect(mockSuperUpdate).not.toHaveBeenCalled();
    expect(mockEntityUpdate).not.toHaveBeenCalled();
  });

  test("resending the stored Ort is a no-op even if it is no longer in the user's scope", async () => {
    mockDbFindOne.mockResolvedValue({ id: 718, location: { id: OUT_OF_SCOPE_LOCATION }, archived: false });
    const ctx = makeCtx({ params: { id: 718 }, data: { title: "x", location: { id: OUT_OF_SCOPE_LOCATION } } });

    const result = await projectController.update(ctx);

    expect(result).not.toEqual(expect.objectContaining({ forbidden: true }));
    expect(mockSuperUpdate).toHaveBeenCalledTimes(1);
    expect(locationLinks()).toHaveLength(0);
  });

  test("an update that does not mention the Ort leaves it alone", async () => {
    const ctx = makeCtx({ params: { id: 718 }, data: { title: "x" } });

    await projectController.update(ctx);

    expect(mockSuperUpdate).toHaveBeenCalledTimes(1);
    expect(locationLinks()).toHaveLength(0);
  });

  test("a leader's save through the archive branch still links the Ort", async () => {
    mockDbFindOne.mockResolvedValue({ id: 718, location: null, archived: false });
    mockFindOne.mockResolvedValue({
      id: MUNICIPALITY_ID,
      landkreise: [],
      locations: [{ id: IN_SCOPE_LOCATION }],
    });
    const ctx = makeCtx({
      params: { id: 718 },
      data: { archived: false, location: { id: IN_SCOPE_LOCATION } },
    });

    await projectController.update(ctx);

    expect(mockSuperUpdate).toHaveBeenCalledTimes(1);
    expect(locationLinks()).toHaveLength(1);
  });

  test("an admin changing the Ort links it without a scope check", async () => {
    const ctx = makeCtx({
      role: "admin",
      params: { id: 718 },
      data: { location: { id: OUT_OF_SCOPE_LOCATION } },
    });

    await projectController.update(ctx);

    expect(mockFindOne).not.toHaveBeenCalled();
    expect(locationLinks()).toHaveLength(1);
  });
});
