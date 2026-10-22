"use strict";

const mockFindMany = jest.fn();
const mockFindOne = jest.fn();
const mockSuperUpdate = jest.fn();
const mockResolveUserScope = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) => {
      const controller = cfgFn({
        strapi: { entityService: { findMany: mockFindMany, findOne: mockFindOne } },
      });
      Object.setPrototypeOf(controller, { update: mockSuperUpdate });
      return controller;
    },
  },
}));

jest.mock("../../../../src/utils/scope-resolver", () => ({
  ...jest.requireActual("../../../../src/utils/scope-resolver"),
  resolveUserScope: (...args) => mockResolveUserScope(...args),
}));

const controller = require("../../../../src/api/user-detail/controllers/user-detail.js");

function makeCtx({ userId = 1, role = "authenticated", data } = {}) {
  return {
    state: { user: { id: userId, role: { type: role } } },
    request: { headers: {}, body: { data }, query: {} },
    params: { id: 5 },
    forbidden: jest.fn((message) => ({ forbidden: message })),
    badRequest: jest.fn((message) => ({ badRequest: message })),
  };
}

const scope = {
  federalStateIds: [1],
  landkreisIds: [10],
  municipalityIds: [100],
  locationIds: [1000, 1001],
};

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindOne.mockReset();
  mockSuperUpdate.mockReset();
  mockResolveUserScope.mockReset();
});

describe("user-detail controller - getEntry() resolved levels", () => {
  test("getEntry returns resolved levels", async () => {
    const ctx = makeCtx();
    mockResolveUserScope.mockResolvedValue(scope);
    mockFindMany.mockImplementation(async (uid) => {
      if (uid === "api::user-detail.user-detail") return [{ id: 9, municipality: { id: 100 } }];
      if (uid === "api::federal-state.federal-state") return [{ id: 1, title: "Schleswig-Holstein", extra: 1 }];
      if (uid === "api::landkreis.landkreis") return [{ id: 10, title: "Nordfriesland" }];
      if (uid === "api::municipality.municipality") return [{ id: 100, title: "Husum" }];
      return [];
    });

    const [entry] = await controller.getEntry(ctx, true);

    expect(entry.resolved).toEqual({
      federalStates: [{ id: 1, title: "Schleswig-Holstein" }],
      landkreise: [{ id: 10, title: "Nordfriesland" }],
      municipality: { id: 100, title: "Husum" },
      locationIds: [1000, 1001],
    });
    const titleQueries = mockFindMany.mock.calls.filter(([uid]) => uid !== "api::user-detail.user-detail");
    expect(titleQueries).toHaveLength(3);
    expect(titleQueries[0][1].filters).toEqual({ id: { $in: [1] } });
  });

  test("a guest's municipality is the one of their location", async () => {
    const ctx = makeCtx({ role: "guest" });
    mockResolveUserScope.mockResolvedValue(scope);
    mockFindMany.mockImplementation(async (uid, opts) => {
      if (uid === "api::user-detail.user-detail") {
        return [{ id: 9, municipality: { id: 999 }, assignedLocation: { id: 1000, municipality: { id: 100 } } }];
      }
      if (uid === "api::municipality.municipality") {
        return opts.filters.id.$in[0] === 100 ? [{ id: 100, title: "Husum" }] : [];
      }
      return [];
    });

    const [entry] = await controller.getEntry(ctx, true);

    expect(entry.resolved.municipality).toEqual({ id: 100, title: "Husum" });
  });

  test("a user without scope resolves to empty levels", async () => {
    const ctx = makeCtx({ role: "admin" });
    mockResolveUserScope.mockResolvedValue(null);
    mockFindMany.mockResolvedValueOnce([{ id: 9 }]);

    const [entry] = await controller.getEntry(ctx, true);

    expect(entry.resolved).toEqual({ federalStates: [], landkreise: [], municipality: null, locationIds: [] });
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  test("the unpopulated lookup stays untouched", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 9 }]);

    const entries = await controller.getEntry(makeCtx(), false);

    expect(entries).toEqual([{ id: 9 }]);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockResolveUserScope).not.toHaveBeenCalled();
  });
});

describe("user-detail controller - update() Ort", () => {
  beforeEach(() => {
    mockFindMany.mockResolvedValue([{ id: 9 }]);
    mockResolveUserScope.mockResolvedValue(scope);
    mockSuperUpdate.mockResolvedValue({ ok: true });
  });

  test("self update strips assignedLocation for guests", async () => {
    const ctx = makeCtx({ role: "guest", data: { assignedLocation: { id: 2000 }, fullName: "G" } });

    await controller.update(ctx);

    expect(ctx.request.body.data).toEqual({ fullName: "G" });
    expect(ctx.forbidden).not.toHaveBeenCalled();
  });

  test("self update rejects Ort outside scope", async () => {
    const ctx = makeCtx({ data: { assignedLocation: { id: 2000 } } });

    const result = await controller.update(ctx);

    expect(ctx.forbidden).toHaveBeenCalled();
    expect(result.forbidden).toBe("Der gewählte Ort liegt nicht in Ihrer Verwaltung");
  });

  test("self update rejects an Ort when the user has no scope", async () => {
    mockResolveUserScope.mockResolvedValue(null);
    const ctx = makeCtx({ data: { assignedLocation: { id: 1000 } } });

    await controller.update(ctx);

    expect(ctx.forbidden).toHaveBeenCalled();
  });

  test("self update accepts Ort in scope and null", async () => {
    const inScope = makeCtx({ data: { assignedLocation: { id: 1000 } } });
    await controller.update(inScope);
    expect(inScope.forbidden).not.toHaveBeenCalled();
    expect(inScope.request.body.data.assignedLocation).toEqual({ id: 1000 });

    const cleared = makeCtx({ data: { assignedLocation: null } });
    await controller.update(cleared);
    expect(cleared.forbidden).not.toHaveBeenCalled();
    expect(cleared.request.body.data.assignedLocation).toBeNull();
  });

  test("self update still strips the anchor fields", async () => {
    const ctx = makeCtx({ data: { municipality: 1, landkreis: 2, federalState: 3, fullName: "A" } });

    await controller.update(ctx);

    expect(ctx.request.body.data).toEqual({ fullName: "A" });
  });
});

describe("user-detail controller - transferData() administration check", () => {
  const detail = (roleType, fields) => ({ role: { type: roleType }, user_detail: fields });
  const guest = (municipalityId) =>
    detail("guest", { assignedLocation: { id: 1000, municipality: municipalityId ? { id: municipalityId } : null } });
  const stubUsers = (from, to) => {
    mockFindOne.mockImplementation(async (uid, id) => (String(id) === "5" ? to : from));
  };
  const transferCtx = () => {
    const ctx = makeCtx({ userId: 1, role: "admin" });
    ctx.request.query = { fromId: 2, data: "project" };
    return ctx;
  };

  beforeEach(() => {
    jest.spyOn(controller, "countAndGetTransferableData").mockResolvedValue({ count: {} });
    jest.spyOn(controller, "transferDataToUser").mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("transferData compares derived municipality: same municipality via guest location is allowed", async () => {
    stubUsers(detail("authenticated", { municipality: { id: 100 } }), guest(100));
    const ctx = transferCtx();

    await controller.transferData.call(controller, ctx);

    expect(ctx.forbidden).not.toHaveBeenCalled();
  });

  test("a guest's legacy stored municipality is ignored", async () => {
    stubUsers(
      detail("authenticated", { municipality: { id: 100 } }),
      detail("guest", { municipality: { id: 100 }, assignedLocation: { id: 2000, municipality: { id: 200 } } })
    );
    const ctx = transferCtx();

    await controller.transferData.call(controller, ctx);

    expect(ctx.forbidden).toHaveBeenCalled();
  });

  test("municipality id 3 and landkreis id 3 are different administrations", async () => {
    stubUsers(detail("authenticated", { municipality: { id: 3 } }), detail("authenticated", { landkreis: { id: 3 } }));
    const ctx = transferCtx();

    await controller.transferData.call(controller, ctx);

    expect(ctx.forbidden).toHaveBeenCalled();
  });

  test("two Landkreis-only users of the same Landkreis are allowed", async () => {
    stubUsers(detail("authenticated", { landkreis: { id: 10 } }), detail("authenticated", { landkreis: { id: 10 } }));
    const ctx = transferCtx();

    await controller.transferData.call(controller, ctx);

    expect(ctx.forbidden).not.toHaveBeenCalled();
  });

  test("users without any administration are refused", async () => {
    stubUsers(detail("authenticated", {}), detail("authenticated", {}));
    const ctx = transferCtx();

    await controller.transferData.call(controller, ctx);

    expect(ctx.forbidden).toHaveBeenCalled();
  });
});
