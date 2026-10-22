"use strict";

const mockCreate = jest.fn();
const mockResolveUserScope = jest.fn();

jest.mock("../../../../src/utils/scope-resolver", () => ({
  ...jest.requireActual("../../../../src/utils/scope-resolver"),
  resolveUserScope: (...args) => mockResolveUserScope(...args),
}));

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) =>
      cfgFn({ strapi: { entityService: { create: mockCreate } } }),
  },
}));

const projectController = require("../../../../src/api/project/controllers/project.js");

const ctx = { badRequest: jest.fn() };

function makePayload({ detail, roleType = "authenticated", originalMunicipality = { id: 100 } }) {
  return {
    user: { id: 4, role: { type: roleType }, user_detail: { fullName: "U", ...detail } },
    project: { id: 8, title: "Idee", municipality: originalMunicipality, owner: { id: 1 }, categories: [] },
  };
}

const createdData = () => mockCreate.mock.calls[0][1].data;

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ id: 99 });
  mockResolveUserScope.mockReset();
});

describe("duplicateProject - municipality of the copy", () => {
  test("duplicateProject keeps municipality for landkreis user when original is in scope", async () => {
    mockResolveUserScope.mockResolvedValue({ municipalityIds: [100, 101] });

    await projectController.duplicateProject(ctx, makePayload({ detail: { municipality: null, landkreis: { id: 10 } } }));

    expect(mockResolveUserScope).toHaveBeenCalledWith(expect.anything(), 4);
    expect(createdData().municipality).toBe(100);
  });

  test("a landkreis user's copy drops an original municipality outside their landkreis", async () => {
    mockResolveUserScope.mockResolvedValue({ municipalityIds: [200] });

    await projectController.duplicateProject(ctx, makePayload({ detail: { municipality: null, landkreis: { id: 10 } } }));

    expect(createdData()).not.toHaveProperty("municipality");
  });

  test("a municipality user's copy goes to their municipality", async () => {
    await projectController.duplicateProject(
      ctx,
      makePayload({ detail: { municipality: { id: 50 }, landkreis: null }, originalMunicipality: { id: 100 } })
    );

    expect(createdData().municipality).toBe(50);
    expect(mockResolveUserScope).not.toHaveBeenCalled();
  });

  test("a guest's copy goes to their location's municipality, not a stored one", async () => {
    await projectController.duplicateProject(
      ctx,
      makePayload({
        roleType: "guest",
        detail: { municipality: { id: 999 }, assignedLocation: { id: 1000, municipality: { id: 100 } } },
        originalMunicipality: { id: 5 },
      })
    );

    expect(createdData().municipality).toBe(100);
  });

  test("a project without any municipality stays without one", async () => {
    mockResolveUserScope.mockResolvedValue({ municipalityIds: [100] });

    await projectController.duplicateProject(
      ctx,
      makePayload({ detail: { municipality: null, landkreis: { id: 10 } }, originalMunicipality: null })
    );

    expect(createdData()).not.toHaveProperty("municipality");
  });
});
