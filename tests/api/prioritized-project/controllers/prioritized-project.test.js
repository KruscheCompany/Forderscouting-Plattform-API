"use strict";

const mockFindMany = jest.fn();
const mockCreate = jest.fn();
const mockDelete = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) =>
      cfgFn({
        strapi: {
          entityService: {
            findMany: mockFindMany,
            create: mockCreate,
            delete: mockDelete,
          },
        },
      }),
  },
}));

const controller = require("../../../../src/api/prioritized-project/controllers/prioritized-project.js");

function makeCtx({ userId = 1, role = "leader", query = {}, params = {}, body = {} } = {}) {
  return {
    state: { user: { id: userId, role: { type: role } } },
    query,
    params,
    request: { body },
    unauthorized: jest.fn((msg) => ({ unauthorized: true, msg })),
    badRequest: jest.fn((msg) => ({ badRequest: true, msg })),
  };
}

beforeEach(() => {
  mockFindMany.mockReset();
  mockCreate.mockReset();
  mockDelete.mockReset();
});

describe("prioritized-project controller - find()", () => {
  test("admin without ?municipality is a bad request", async () => {
    const ctx = makeCtx({ role: "admin" });
    const result = await controller.find(ctx);
    expect(ctx.badRequest).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  test("admin with ?municipality queries that municipality", async () => {
    const ctx = makeCtx({ role: "admin", query: { municipality: "7" } });
    mockFindMany.mockResolvedValueOnce([{ id: 1 }]);

    const result = await controller.find(ctx);

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const [uid, options] = mockFindMany.mock.calls[0];
    expect(uid).toBe("api::prioritized-project.prioritized-project");
    expect(options.filters).toEqual({ municipality: { id: "7" } });
    expect(result).toEqual([{ id: 1 }]);
  });

  test("leader without an assigned municipality is unauthorized", async () => {
    const ctx = makeCtx({ role: "leader" });
    mockFindMany.mockResolvedValueOnce([]); // user-detail lookup -> no rows

    const result = await controller.find(ctx);

    expect(ctx.unauthorized).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ unauthorized: true, msg: expect.any(String) });
  });

  test("leader is scoped to their own municipality automatically", async () => {
    const ctx = makeCtx({ role: "leader", query: { municipality: "99" } }); // param must be ignored
    mockFindMany
      .mockResolvedValueOnce([{ municipality: { id: 10 } }]) // user-detail lookup
      .mockResolvedValueOnce([{ id: 1 }]); // prioritized-project lookup

    await controller.find(ctx);

    const [, options] = mockFindMany.mock.calls[1];
    expect(options.filters).toEqual({ municipality: { id: 10 } });
  });
});

describe("prioritized-project controller - create()", () => {
  test("non-leader is unauthorized", async () => {
    const ctx = makeCtx({ role: "authenticated" });
    const result = await controller.create(ctx);
    expect(result).toEqual({ unauthorized: true, msg: expect.any(String) });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  test("missing projectId is a bad request", async () => {
    const ctx = makeCtx({ role: "leader", body: { data: {} } });
    mockFindMany.mockResolvedValueOnce([{ municipality: { id: 10 } }]); // user-detail lookup

    const result = await controller.create(ctx);

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
  });

  test("project outside the leader's municipality is unauthorized", async () => {
    const ctx = makeCtx({ role: "leader", body: { data: { project: 5 } } });
    mockFindMany
      .mockResolvedValueOnce([{ municipality: { id: 10 } }]) // user-detail
      .mockResolvedValueOnce([]); // project lookup scoped to municipality 10 -> not found

    const result = await controller.create(ctx);

    expect(result).toEqual({ unauthorized: true, msg: expect.any(String) });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("already-prioritized project is a bad request", async () => {
    const ctx = makeCtx({ role: "leader", body: { data: { project: 5 } } });
    mockFindMany
      .mockResolvedValueOnce([{ municipality: { id: 10 } }]) // user-detail
      .mockResolvedValueOnce([{ id: 5 }]) // project belongs to municipality
      .mockResolvedValueOnce([{ id: 1 }]); // existing prioritized-project row

    const result = await controller.create(ctx);

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("first pin for a municipality gets position 0", async () => {
    const ctx = makeCtx({ role: "leader", body: { data: { project: 5 } } });
    mockFindMany
      .mockResolvedValueOnce([{ municipality: { id: 10 } }])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([]) // no existing entry
      .mockResolvedValueOnce([]); // no current entries -> position 0
    mockCreate.mockResolvedValueOnce({ id: 1, position: 0 });

    await controller.create(ctx);

    const [, options] = mockCreate.mock.calls[0];
    expect(options.data).toEqual({
      project: 5,
      municipality: 10,
      prioritizedBy: 1,
      position: 0,
    });
  });

  test("subsequent pin gets max(position) + 1", async () => {
    const ctx = makeCtx({ role: "leader", body: { data: { project: 5 } } });
    mockFindMany
      .mockResolvedValueOnce([{ municipality: { id: 10 } }])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ position: 0 }, { position: 1 }]);
    mockCreate.mockResolvedValueOnce({ id: 3, position: 2 });

    await controller.create(ctx);

    const [, options] = mockCreate.mock.calls[0];
    expect(options.data.position).toBe(2);
  });
});

describe("prioritized-project controller - delete()", () => {
  test("non-leader is unauthorized", async () => {
    const ctx = makeCtx({ role: "admin", params: { id: 1 } });
    const result = await controller.delete(ctx);
    expect(result).toEqual({ unauthorized: true, msg: expect.any(String) });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test("row belonging to another municipality is unauthorized", async () => {
    const ctx = makeCtx({ role: "leader", params: { id: 1 } });
    mockFindMany
      .mockResolvedValueOnce([{ municipality: { id: 10 } }]) // user-detail
      .mockResolvedValueOnce([]); // row not found scoped to municipality 10

    const result = await controller.delete(ctx);

    expect(result).toEqual({ unauthorized: true, msg: expect.any(String) });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test("own-municipality row is deleted", async () => {
    const ctx = makeCtx({ role: "leader", params: { id: 1 } });
    mockFindMany
      .mockResolvedValueOnce([{ municipality: { id: 10 } }])
      .mockResolvedValueOnce([{ id: 1 }]);
    mockDelete.mockResolvedValueOnce({ id: 1 });

    const result = await controller.delete(ctx);

    expect(mockDelete).toHaveBeenCalledWith(
      "api::prioritized-project.prioritized-project",
      1
    );
    expect(result).toEqual({ id: 1 });
  });
});
