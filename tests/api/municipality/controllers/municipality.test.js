"use strict";

const mockFindMany = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) =>
      cfgFn({ strapi: { entityService: { findMany: mockFindMany } } }),
  },
}));

const controller = require("../../../../src/api/municipality/controllers/municipality.js");

const STATE_1 = { id: 1, title: "Schleswig-Holstein" };
const STATE_2 = { id: 2, title: "Hamburg" };

const municipality = (id, landkreise) => ({
  id,
  title: `Gemeinde ${id}`,
  projects: [],
  user_details: [],
  landkreise,
});

const MUNICIPALITIES = () => [
  municipality(100, [{ id: 10, title: "LK 10", federalStates: [STATE_1] }]),
  municipality(300, [
    { id: 10, title: "LK 10", federalStates: [STATE_1] },
    { id: 20, title: "LK 20", federalStates: [STATE_2] },
  ]),
  municipality(400, []),
];

const ctx = { state: { user: { id: 1, role: { type: "admin" } } } };

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindMany.mockImplementation(async () => MUNICIPALITIES());
});

describe("municipality controller - find()", () => {
  test("municipality admin list shows federal states via landkreise", async () => {
    const entries = await controller.find(ctx);
    const byId = Object.fromEntries(entries.map((e) => [e.id, e]));

    expect(byId[100].federalStates).toEqual([STATE_1]);
    expect(byId[100].landkreise.map((l) => l.id)).toEqual([10]);
  });

  test("municipality admin list unions the federal states of all its landkreise", async () => {
    const entries = await controller.find(ctx);

    expect(entries.find((e) => e.id === 300).federalStates).toEqual([STATE_1, STATE_2]);
  });

  test("municipality admin list gives a municipality without landkreise no federal states", async () => {
    const entries = await controller.find(ctx);

    expect(entries.find((e) => e.id === 400).federalStates).toEqual([]);
  });

  test("municipality admin list populates federal states through landkreise only", async () => {
    await controller.find(ctx);

    const { populate } = mockFindMany.mock.calls[0][1];
    expect(populate.landkreise).toEqual({ populate: { federalStates: true } });
    expect(populate.federalStates).toBeUndefined();
  });
});
