"use strict";

const mockFindMany = jest.fn();
const mockFindOne = jest.fn();
const mockUpdate = jest.fn();
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

const controller = require("../../../../src/api/vorpruefung-ticket/controllers/vorpruefung-ticket.js");

function makeCtx({ params = {}, body = {} } = {}) {
  return {
    params,
    request: { body },
    notFound: jest.fn((msg) => ({ notFound: true, msg })),
    badRequest: jest.fn((msg) => ({ badRequest: true, msg })),
  };
}

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindOne.mockReset();
  mockUpdate.mockReset();
  mockUpdateMany.mockReset();
  mockEmailSend.mockReset();
  mockRandomUUID.mockClear();
  process.env.DEF_FROM = "noreply@example.com";
  process.env.VORPRUEFUNG_REVIEW_PAGE = "https://app.example.com/review/";
});

describe("vorpruefung-ticket controller - resend()", () => {
  test("regenerates token and resends the email", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 1,
      type: "finanzen",
      reviewerContact: "finanzen@musterdorf.de",
      project: { id: 42, title: "Spielplatz" },
    });

    const ctx = makeCtx({ params: { id: 1 } });
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

  test("valid submission does a conditional update scoped to token + unanswered", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });
    const ctx = makeCtx({
      params: { token: "abc" },
      body: { decisionType: "positiv", responseText: "Passt.", wantsPhoneCall: true },
    });

    const result = await controller.respondByToken(ctx);

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: "abc", answeredAt: null },
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
});
