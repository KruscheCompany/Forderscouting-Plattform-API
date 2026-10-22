"use strict";

const mockFindMany = jest.fn();
const mockResolveUserScope = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) =>
      cfgFn({ strapi: { entityService: { findMany: mockFindMany } } }),
  },
}));

jest.mock("../../../../src/utils/scope-resolver", () => ({
  ...jest.requireActual("../../../../src/utils/scope-resolver"),
  resolveUserScope: (...args) => mockResolveUserScope(...args),
}));

const controller = require("../../../../src/api/location/controllers/location.js");

const LOCATIONS = [
  { id: 1000, title: "Ort A", municipality: { id: 100, title: "Husum" } },
  { id: 2000, title: "Ort B", municipality: { id: 200, title: "Kiel" } },
  { id: 3000, title: "Ort C", municipality: { id: 300, title: "Mitte" } },
  { id: 5000, title: "Ort ohne Verwaltung", municipality: null },
];

function makeCtx({ role = "authenticated", query = {} } = {}) {
  return {
    state: { user: { id: 1, role: { type: role } } },
    query,
    request: { headers: {} },
    forbidden: jest.fn((message) => ({ forbidden: message })),
  };
}

beforeEach(() => {
  mockFindMany.mockReset();
  mockResolveUserScope.mockReset();
  mockFindMany.mockImplementation(async (uid, opts = {}) => {
    const allowedIds = opts.filters?.id?.$in;
    return allowedIds ? LOCATIONS.filter((l) => allowedIds.includes(l.id)) : LOCATIONS;
  });
});

describe("location controller - findByMunicipality()", () => {
  test("findByMunicipality returns locations in derived scope", async () => {
    mockResolveUserScope.mockResolvedValue({
      federalStateIds: [1, 2],
      landkreisIds: [10],
      municipalityIds: [100, 300],
      locationIds: [1000, 3000],
    });

    const result = await controller.findByMunicipality(makeCtx());

    expect(result.map((l) => l.id)).toEqual([1000, 3000]);
  });

  test("findByMunicipality forbids a non-admin without a scope", async () => {
    mockResolveUserScope.mockResolvedValue(null);
    const ctx = makeCtx();

    await controller.findByMunicipality(ctx);

    expect(ctx.forbidden).toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  test("findByMunicipality lets an admin filter by municipality without resolving a scope", async () => {
    await controller.findByMunicipality(makeCtx({ role: "admin", query: { municipalityId: "100,300" } }));

    expect(mockFindMany).toHaveBeenCalledWith(
      "api::location.location",
      expect.objectContaining({ filters: { municipality: { id: { $in: ["100", "300"] } } } })
    );
  });
});

describe("location controller - find()", () => {
  test("find only populates the municipality", async () => {
    await controller.find(makeCtx());

    expect(mockFindMany).toHaveBeenCalledWith("api::location.location", { populate: ["municipality"] });
  });
});

describe("location controller - findGroupedByMunicipality()", () => {
  test("findGroupedByMunicipality skips locations without municipality", async () => {
    const result = await controller.findGroupedByMunicipality(makeCtx());

    expect(result).toEqual({ Husum: ["Ort A"], Kiel: ["Ort B"], Mitte: ["Ort C"] });
  });
});
