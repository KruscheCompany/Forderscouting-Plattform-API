"use strict";

const mockFindMany = jest.fn();
const mockFindOne = jest.fn();
const mockUpdate = jest.fn();
const mockCreate = jest.fn();
const mockUpdateMany = jest.fn();
const mockEmailSend = jest.fn();

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) =>
      cfgFn({
        strapi: {
          entityService: {
            findMany: mockFindMany,
            findOne: mockFindOne,
            update: mockUpdate,
            create: mockCreate,
          },
          db: {
            query: () => ({ updateMany: mockUpdateMany }),
          },
          plugins: {
            email: { services: { email: { send: mockEmailSend } } },
          },
        },
      }),
  },
}));

// recipient.js reaches for the global strapi, as it does at runtime.
global.strapi = {
  entityService: {
    findMany: mockFindMany,
    findOne: mockFindOne,
    update: mockUpdate,
    create: mockCreate,
  },
  plugins: {
    email: { services: { email: { send: mockEmailSend } } },
  },
};

const controller = require("../../../../src/api/vorpruefung-ticket/controllers/vorpruefung-ticket.js");

const TICKET_UID = "api::vorpruefung-ticket.vorpruefung-ticket";
const OWNER = { id: 1, role: { type: "authenticated" } };
const READER = { id: 2, role: { type: "authenticated" } };
const ADMIN = { id: 9, role: { type: "admin" } };

const DECISION = { decisionType: "positiv", responseText: "Passt" };

function makeCtx({ params = {}, body = {}, user = OWNER } = {}) {
  return {
    params,
    query: {},
    state: { user },
    request: { body, headers: {} },
    notFound: jest.fn((msg) => ({ notFound: true, msg })),
    badRequest: jest.fn((msg) => ({ badRequest: true, msg })),
    forbidden: jest.fn((msg) => ({ forbidden: true, msg })),
  };
}

// A project owned by user 1 whose only other member is reader 2.
const PROJECT_MEMBERS = { id: 42, visibility: "only for me", owner: { id: 1 }, editors: [], readers: [{ id: 2 }] };
const RECIPIENT_PROJECT = { id: 42, title: "Spielplatz", municipality: { financeContactEmail: "finanzen@musterdorf.de" } };

function duplicateEntryError() {
  const error = new Error("Duplicate entry '42:finanzen' for key 'vorpruefung_tickets_live_key_unique'");
  error.code = "ER_DUP_ENTRY";
  error.errno = 1062;
  return error;
}

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindMany.mockResolvedValue([]);
  mockFindOne.mockReset();
  mockUpdate.mockReset();
  mockCreate.mockReset();
  mockUpdateMany.mockReset();
  mockEmailSend.mockReset();
});

describe("create() - edit rights and the one-live-request rule", () => {
  test("a reader of the project may not send a request", async () => {
    mockFindOne.mockResolvedValueOnce(RECIPIENT_PROJECT).mockResolvedValueOnce(PROJECT_MEMBERS);
    const ctx = makeCtx({ body: { data: { project: 42, type: "finanzen" } }, user: READER });

    const result = await controller.create(ctx);

    expect(result).toEqual({ forbidden: true, msg: expect.any(String) });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("the new request carries the live key and the next attempt number", async () => {
    mockFindOne.mockResolvedValueOnce(RECIPIENT_PROJECT).mockResolvedValueOnce(PROJECT_MEMBERS);
    mockFindMany
      .mockResolvedValueOnce([]) // live lookup
      .mockResolvedValueOnce([{ attempt: 3 }]); // latest attempt
    mockCreate.mockResolvedValueOnce({ id: 7, type: "finanzen", token: "t", liveKey: "42:finanzen" });
    const ctx = makeCtx({ body: { data: { project: 42, type: "finanzen" } } });

    const result = await controller.create(ctx);

    expect(mockCreate).toHaveBeenCalledWith(TICKET_UID, {
      data: { project: 42, type: "finanzen", notes: "", attempt: 4, liveKey: "42:finanzen" },
    });
    expect(result).toEqual({ id: 7, type: "finanzen" });
  });

  test("a concurrent request that loses on the unique index is a bad request, not a 500", async () => {
    mockFindOne.mockResolvedValueOnce(RECIPIENT_PROJECT).mockResolvedValueOnce(PROJECT_MEMBERS);
    mockCreate.mockRejectedValueOnce(duplicateEntryError());
    const ctx = makeCtx({ body: { data: { project: 42, type: "finanzen" } } });

    const result = await controller.create(ctx);

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
  });

  test("other database errors still surface", async () => {
    mockFindOne.mockResolvedValueOnce(RECIPIENT_PROJECT).mockResolvedValueOnce(PROJECT_MEMBERS);
    mockCreate.mockRejectedValueOnce(new Error("connection lost"));
    const ctx = makeCtx({ body: { data: { project: 42, type: "finanzen" } } });

    await expect(controller.create(ctx)).rejects.toThrow("connection lost");
  });
});

describe("updateNotes() - edit rights", () => {
  test("a reader of the project may not edit notes", async () => {
    mockFindOne
      .mockResolvedValueOnce({ id: 5, supersededAt: null, project: { id: 42 } })
      .mockResolvedValueOnce(PROJECT_MEMBERS);
    const ctx = makeCtx({ params: { id: 5 }, body: { data: { notes: "x" } }, user: READER });

    const result = await controller.updateNotes(ctx);

    expect(result).toEqual({ forbidden: true, msg: expect.any(String) });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("resend() of an answered request - live key hand-over", () => {
  test("the retired attempt drops its key and the new attempt takes it", async () => {
    mockFindOne
      .mockResolvedValueOnce({
        id: 5, type: "finanzen", notes: "n", attempt: 2, status: "negativ",
        answeredAt: new Date(), supersededAt: null, project: { id: 42, title: "Spielplatz" },
      })
      .mockResolvedValueOnce(PROJECT_MEMBERS)
      .mockResolvedValueOnce(RECIPIENT_PROJECT);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockCreate.mockResolvedValueOnce({ id: 6, attempt: 3 });

    const result = await controller.resend(makeCtx({ params: { id: 5 } }));

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 5, supersededAt: null },
      data: { supersededAt: expect.any(Date), supersededReason: "resend", liveKey: null },
    });
    expect(mockCreate).toHaveBeenCalledWith(TICKET_UID, {
      data: { project: 42, type: "finanzen", notes: "n", attempt: 3, liveKey: "42:finanzen" },
    });
    expect(result).toEqual({ success: true, id: 6, attempt: 3 });
  });
});

describe("resetForProject() - live keys", () => {
  test("retired requests release their live keys", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 5 }, { id: 6 }]);
    mockUpdateMany.mockResolvedValueOnce({ count: 2 });

    const result = await controller.resetForProject(makeCtx({ body: { project: 42 }, user: ADMIN }));

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { $in: [5, 6] }, supersededAt: null },
      data: { supersededAt: expect.any(Date), supersededReason: "fundingChanged", liveKey: null },
    });
    expect(result).toEqual({ success: true, count: 2 });
  });
});

describe("override() without a ticket id - decide without asking anyone", () => {
  function overrideCtx(body, user = ADMIN) {
    return makeCtx({ body: { project: 42, type: "finanzen", ...DECISION, ...body }, user });
  }

  test("only admins may override", async () => {
    const result = await controller.override(overrideCtx({}, OWNER));

    expect(result).toEqual({ forbidden: true, msg: expect.any(String) });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("an unknown type is a bad request", async () => {
    const result = await controller.override(overrideCtx({ type: "sonstiges" }));

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
  });

  test("an invalid decision is a bad request", async () => {
    const result = await controller.override(overrideCtx({ decisionType: "sent" }));

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
  });

  test("with no request yet, it records an answered, overridden attempt", async () => {
    mockFindOne.mockResolvedValueOnce({ id: 42 });
    mockFindMany
      .mockResolvedValueOnce([]) // live lookup
      .mockResolvedValueOnce([]); // latest attempt
    mockCreate.mockResolvedValueOnce({ id: 11 });

    const result = await controller.override(overrideCtx({}));

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(TICKET_UID, {
      data: expect.objectContaining({
        project: 42,
        type: "finanzen",
        attempt: 1,
        liveKey: "42:finanzen",
        status: "positiv",
        responseText: "Passt",
        answeredAt: expect.any(Date),
        overriddenAt: expect.any(Date),
        overriddenBy: 9,
      }),
    });
    expect(result).toEqual({ success: true, id: 11 });
  });

  test("with a pending request, it answers that request in place", async () => {
    mockFindOne.mockResolvedValueOnce({ id: 42 });
    mockFindMany.mockResolvedValueOnce([{ id: 5, status: "sent", answeredAt: null }]);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await controller.override(overrideCtx({}));

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 5, answeredAt: null, supersededAt: null },
      data: expect.objectContaining({ status: "positiv", answeredAt: expect.any(Date), overriddenAt: expect.any(Date) }),
    });
    expect(mockUpdate).toHaveBeenCalledWith(TICKET_UID, 5, { data: { overriddenBy: 9 } });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, id: 5 });
  });

  test("with a declined request, it keeps that answer in the history and adds a new attempt", async () => {
    mockFindOne.mockResolvedValueOnce({ id: 42 });
    mockFindMany
      .mockResolvedValueOnce([{ id: 5, status: "negativ", answeredAt: new Date() }])
      .mockResolvedValueOnce([{ attempt: 2 }]);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockCreate.mockResolvedValueOnce({ id: 12 });

    const result = await controller.override(overrideCtx({}));

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 5, supersededAt: null },
      data: { supersededAt: expect.any(Date), supersededReason: "override", liveKey: null },
    });
    expect(mockCreate).toHaveBeenCalledWith(TICKET_UID, {
      data: expect.objectContaining({ attempt: 3, liveKey: "42:finanzen", overriddenBy: 9 }),
    });
    expect(result).toEqual({ success: true, id: 12 });
  });

  test("a positive review cannot be overridden", async () => {
    mockFindOne.mockResolvedValueOnce({ id: 42 });
    mockFindMany.mockResolvedValueOnce([{ id: 5, status: "positiv", answeredAt: new Date() }]);

    const result = await controller.override(overrideCtx({}));

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("a request created concurrently wins; the override reports it instead of erroring", async () => {
    mockFindOne.mockResolvedValueOnce({ id: 42 });
    mockCreate.mockRejectedValueOnce(duplicateEntryError());

    const result = await controller.override(overrideCtx({}));

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
  });

  test("an unknown project is a bad request", async () => {
    mockFindOne.mockResolvedValueOnce(null);

    const result = await controller.override(overrideCtx({}));

    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
