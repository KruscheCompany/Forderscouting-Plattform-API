"use strict";

const mockFindMany = jest.fn();
const mockFindOne = jest.fn();
const mockUpdate = jest.fn();
const mockCreate = jest.fn();
const mockUpdateMany = jest.fn();
const mockEmailSend = jest.fn();
const mockRandomUUID = jest.fn(() => "new-token-uuid");

jest.mock("crypto", () => ({ randomUUID: mockRandomUUID }));

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

// The controller reuses `fetchProjectForRecipient` from the shared recipient
// module, which reaches for the *global* `strapi` (as it does at runtime),
// not the `strapi` injected into createCoreController. Point it at the same
// mocks so create()/resend() recipient resolution is observable here.
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

function makeCtx({ params = {}, body = {}, query = {}, user = { id: 1, role: { type: "authenticated" } } } = {}) {
  return {
    params,
    query,
    state: { user },
    request: { body },
    notFound: jest.fn((msg) => ({ notFound: true, msg })),
    badRequest: jest.fn((msg) => ({ badRequest: true, msg })),
    forbidden: jest.fn((msg) => ({ forbidden: true, msg })),
  };
}

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindOne.mockReset();
  mockUpdate.mockReset();
  mockCreate.mockReset();
  mockUpdateMany.mockReset();
  mockEmailSend.mockReset();
  mockRandomUUID.mockClear();
  process.env.DEF_FROM = "noreply@example.com";
  process.env.VORPRUEFUNG_REVIEW_PAGE = "https://app.example.com/review/";
});

describe("vorpruefung-ticket controller - resend()", () => {
  test("regenerates token and resends the email (owner)", async () => {
    mockFindOne
      .mockResolvedValueOnce({
        id: 1,
        type: "finanzen",
        reviewerContact: "finanzen@musterdorf.de",
        project: { id: 42, title: "Spielplatz" },
      })
      .mockResolvedValueOnce({
        id: 42,
        visibility: "only for me",
        owner: { id: 1 },
        editors: [],
        readers: [],
      });

    const ctx = makeCtx({ params: { id: 1 }, user: { id: 1, role: { type: "authenticated" } } });
    await controller.resend(ctx);

    expect(mockUpdate).toHaveBeenCalledWith(
      "api::vorpruefung-ticket.vorpruefung-ticket",
      1,
      expect.objectContaining({
        data: expect.objectContaining({ token: "new-token-uuid" }),
      })
    );
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
    expect(mockEmailSend.mock.calls[0][0].to).toBe("finanzen@musterdorf.de");
  });

  test("missing ticket is a 404", async () => {
    mockFindOne.mockResolvedValueOnce(null);
    const ctx = makeCtx({ params: { id: 999 } });

    const result = await controller.resend(ctx);

    expect(result).toEqual({ notFound: true, msg: expect.any(String) });
    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  test("user with no relation to the ticket's project is forbidden", async () => {
    mockFindOne
      .mockResolvedValueOnce({
        id: 1,
        type: "finanzen",
        reviewerContact: "finanzen@musterdorf.de",
        project: { id: 42, title: "Spielplatz" },
      })
      .mockResolvedValueOnce({
        id: 42,
        visibility: "only for me",
        owner: { id: 1 },
        editors: [],
        readers: [],
      });

    const ctx = makeCtx({ params: { id: 1 }, user: { id: 999, role: { type: "authenticated" } } });
    const result = await controller.resend(ctx);

    expect(result).toEqual({ forbidden: true, msg: expect.any(String) });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockEmailSend).not.toHaveBeenCalled();
  });
});

describe("vorpruefung-ticket controller - find()", () => {
  test("admin bypasses the project-access check entirely", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 1 }]);
    const ctx = makeCtx({
      query: { filters: { project: 42 } },
      user: { id: 1, role: { type: "admin" } },
    });

    const result = await controller.find(ctx);

    expect(mockFindOne).not.toHaveBeenCalled();
    expect(mockFindMany).toHaveBeenCalledWith(
      "api::vorpruefung-ticket.vorpruefung-ticket",
      expect.objectContaining({ filters: { project: 42 } })
    );
    expect(result).toEqual([{ id: 1 }]);
  });

  test("non-admin without a project filter is a bad request", async () => {
    const ctx = makeCtx({ query: {} });
    const result = await controller.find(ctx);
    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  test("an operator object as the project filter is rejected, not passed through", async () => {
    const ctx = makeCtx({ query: { filters: { project: { $gte: 1 } } } });
    const result = await controller.find(ctx);
    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  test("non-admin who is the project's owner can read its tickets, with fields restricted (no token)", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      visibility: "only for me",
      owner: { id: 7 },
      editors: [],
      readers: [],
    });
    mockFindMany.mockResolvedValueOnce([{ id: 1 }]);
    const ctx = makeCtx({
      query: { filters: { project: 42 } },
      user: { id: 7, role: { type: "authenticated" } },
    });

    const result = await controller.find(ctx);

    const [, options] = mockFindMany.mock.calls[0];
    expect(options.fields).toEqual(expect.arrayContaining(["id", "type", "status"]));
    expect(options.fields).not.toEqual(expect.arrayContaining(["token"]));
    expect(result).toEqual([{ id: 1 }]);
  });

  test("non-admin with no relation to a private project is forbidden", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      visibility: "only for me",
      owner: { id: 7 },
      editors: [],
      readers: [],
    });
    const ctx = makeCtx({
      query: { filters: { project: 42 } },
      user: { id: 999, role: { type: "authenticated" } },
    });

    const result = await controller.find(ctx);

    expect(result).toEqual({ forbidden: true, msg: expect.any(String) });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  test("non-admin can read tickets for an 'all users' visibility project even without a direct relation", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      visibility: "all users",
      owner: { id: 7 },
      editors: [],
      readers: [],
    });
    mockFindMany.mockResolvedValueOnce([{ id: 1 }]);
    const ctx = makeCtx({
      query: { filters: { project: 42 } },
      user: { id: 999, role: { type: "authenticated" } },
    });

    const result = await controller.find(ctx);

    expect(result).toEqual([{ id: 1 }]);
  });
});

describe("vorpruefung-ticket controller - create()", () => {
  test("missing project or type is a bad request", async () => {
    const ctx = makeCtx({ body: { data: { type: "finanzen" } } });
    const result = await controller.create(ctx);
    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("project not found is a bad request", async () => {
    mockFindOne.mockResolvedValueOnce(null);
    const ctx = makeCtx({ body: { data: { project: 42, type: "finanzen" } } });
    const result = await controller.create(ctx);
    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("no resolvable recipient is a bad request, ticket is never created", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      municipality: {},
      fundingGuideline: null,
    });
    const ctx = makeCtx({ body: { data: { project: 42, type: "finanzen" } } });
    const result = await controller.create(ctx);
    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("resolvable recipient creates the ticket, response never includes a token even if present", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      municipality: { financeContactEmail: "finanzen@musterdorf.de" },
      fundingGuideline: null,
    });
    mockCreate.mockResolvedValueOnce({ id: 1, type: "finanzen", project: 42, token: null });
    const ctx = makeCtx({ body: { data: { project: 42, type: "finanzen", notes: "x" } } });

    const result = await controller.create(ctx);

    expect(mockCreate).toHaveBeenCalledWith(
      "api::vorpruefung-ticket.vorpruefung-ticket",
      { data: { project: 42, type: "finanzen", notes: "x" } }
    );
    expect(result).toEqual({ id: 1, type: "finanzen", project: 42 });
    expect(result.token).toBeUndefined();
  });
});

describe("vorpruefung-ticket controller - updateNotes()", () => {
  test("missing ticket is a 404", async () => {
    mockFindOne.mockResolvedValueOnce(null);
    const ctx = makeCtx({ params: { id: 999 }, body: { data: { notes: "x" } } });
    const result = await controller.updateNotes(ctx);
    expect(result).toEqual({ notFound: true, msg: expect.any(String) });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("user with no relation to the ticket's project is forbidden", async () => {
    mockFindOne
      .mockResolvedValueOnce({ id: 1, project: { id: 42 } })
      .mockResolvedValueOnce({
        id: 42,
        visibility: "only for me",
        owner: { id: 1 },
        editors: [],
        readers: [],
      });

    const ctx = makeCtx({
      params: { id: 1 },
      body: { data: { notes: "pwned" } },
      user: { id: 999, role: { type: "authenticated" } },
    });

    const result = await controller.updateNotes(ctx);

    expect(result).toEqual({ forbidden: true, msg: expect.any(String) });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("owner updates notes; response contains only id and notes, no token", async () => {
    mockFindOne
      .mockResolvedValueOnce({ id: 1, project: { id: 42 } })
      .mockResolvedValueOnce({
        id: 42,
        visibility: "only for me",
        owner: { id: 1 },
        editors: [],
        readers: [],
      });
    mockUpdate.mockResolvedValueOnce({
      id: 1,
      notes: "neuer text",
      token: "should-never-leak",
      reviewerContact: "finanzen@musterdorf.de",
    });
    const ctx = makeCtx({
      params: { id: 1 },
      body: { data: { notes: "neuer text" } },
      user: { id: 1, role: { type: "authenticated" } },
    });

    const result = await controller.updateNotes(ctx);

    expect(mockUpdate).toHaveBeenCalledWith(
      "api::vorpruefung-ticket.vorpruefung-ticket",
      1,
      { data: { notes: "neuer text" } }
    );
    expect(result).toEqual({ id: 1, notes: "neuer text" });
  });
});

describe("vorpruefung-ticket controller - findByToken()", () => {
  test("valid unanswered token returns project context", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 1,
        answeredAt: null,
        tokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        project: { id: 42, title: "Spielplatz" },
      },
    ]);

    const ctx = makeCtx({ params: { token: "abc" } });
    const result = await controller.findByToken(ctx);

    const [uid, options] = mockFindMany.mock.calls[0];
    expect(uid).toBe("api::vorpruefung-ticket.vorpruefung-ticket");
    expect(options.filters).toEqual({ token: "abc" });
    expect(result.project.title).toBe("Spielplatz");
    expect(result.alreadyAnswered).toBe(false);

    // project populate must cover everything ProjectPrint.vue (reused on the
    // public review page for the PDF download) reads, not just the tabs.
    const projectPopulate = options.populate.project;
    expect(projectPopulate.fields).toEqual(
      expect.arrayContaining(["id", "title", "plannedStart", "plannedEnd"])
    );
    expect(projectPopulate.populate).toMatchObject({
      details: true,
      financialPlan: true,
      fundingMatches: true,
      questions: true,
      files: true,
      media: true,
      links: true,
      categories: { fields: ["title"] },
      tags: { fields: ["title"] },
      estimatedCosts: true,
      info: true,
      editors: { fields: ["username"] },
      owner: { fields: ["username"] },
      fundingGuideline: { fields: ["title"] },
    });
  });

  test("already-answered token returns alreadyAnswered=true, no project payload leak beyond that flag", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 1,
        answeredAt: "2026-01-01T00:00:00.000Z",
        tokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        project: { id: 42, title: "Spielplatz" },
      },
    ]);

    const ctx = makeCtx({ params: { token: "abc" } });
    const result = await controller.findByToken(ctx);

    expect(result.alreadyAnswered).toBe(true);
    expect(result.answeredAt).toBe("2026-01-01T00:00:00.000Z");
  });

  test("expired token is a generic 404", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, answeredAt: null, tokenExpiresAt: new Date(Date.now() - 86400000).toISOString() },
    ]);

    const ctx = makeCtx({ params: { token: "abc" } });
    const result = await controller.findByToken(ctx);

    expect(result).toEqual({ notFound: true, msg: expect.any(String) });
  });

  test("nonexistent token is the same generic 404", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const ctx = makeCtx({ params: { token: "does-not-exist" } });
    const result = await controller.findByToken(ctx);

    expect(result).toEqual({ notFound: true, msg: expect.any(String) });
  });
});

describe("vorpruefung-ticket controller - respondByToken()", () => {
  test("missing decisionType is a bad request", async () => {
    const ctx = makeCtx({ params: { token: "abc" }, body: { responseText: "ok" } });
    const result = await controller.respondByToken(ctx);
    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("missing responseText is a bad request", async () => {
    const ctx = makeCtx({ params: { token: "abc" }, body: { decisionType: "positiv" } });
    const result = await controller.respondByToken(ctx);
    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
  });

  test("invalid decisionType is a bad request and never reaches updateMany", async () => {
    const ctx = makeCtx({
      params: { token: "abc" },
      body: { decisionType: "foo", responseText: "ok" },
    });
    const result = await controller.respondByToken(ctx);
    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("decisionType of 'sent' is rejected (reviewer cannot reset ticket to sent)", async () => {
    const ctx = makeCtx({
      params: { token: "abc" },
      body: { decisionType: "sent", responseText: "ok" },
    });
    const result = await controller.respondByToken(ctx);
    expect(result).toEqual({ badRequest: true, msg: expect.any(String) });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("valid submission does a conditional update scoped to token + unanswered", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });
    const ctx = makeCtx({
      params: { token: "abc" },
      body: { decisionType: "positiv", responseText: "Passt.", wantsPhoneCall: true },
    });

    const result = await controller.respondByToken(ctx);

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          token: "abc",
          answeredAt: null,
          tokenExpiresAt: { $gt: expect.any(Date) },
        },
        data: expect.objectContaining({
          status: "positiv",
          responseText: "Passt.",
          wantsPhoneCall: true,
        }),
      })
    );
    expect(result).toEqual({ success: true });
  });

  test("token already answered (count 0) returns a 404, not a silent success", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    const ctx = makeCtx({
      params: { token: "abc" },
      body: { decisionType: "positiv", responseText: "x" },
    });

    const result = await controller.respondByToken(ctx);

    expect(result).toEqual({ notFound: true, msg: expect.any(String) });
  });

  test("expired token (count 0 due to expiry) returns the same generic 404", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    const ctx = makeCtx({
      params: { token: "abc" },
      body: { decisionType: "positiv", responseText: "x" },
    });

    const result = await controller.respondByToken(ctx);

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          token: "abc",
          answeredAt: null,
          tokenExpiresAt: { $gt: expect.any(Date) },
        }),
      })
    );
    expect(result).toEqual({ notFound: true, msg: expect.any(String) });
  });
});
