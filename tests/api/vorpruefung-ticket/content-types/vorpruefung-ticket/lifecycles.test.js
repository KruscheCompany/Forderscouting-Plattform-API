"use strict";

const mockFindOne = jest.fn();
const mockUpdate = jest.fn();
const mockEmailSend = jest.fn();
const mockRandomUUID = jest.fn(() => "fixed-test-uuid");

jest.mock("crypto", () => ({
  randomUUID: mockRandomUUID,
}));

global.strapi = {
  entityService: {
    findOne: mockFindOne,
    update: mockUpdate,
  },
  plugins: {
    email: {
      services: {
        email: { send: mockEmailSend },
      },
    },
  },
};

const lifecycles = require("../../../../../src/api/vorpruefung-ticket/content-types/vorpruefung-ticket/lifecycles.js");

beforeEach(() => {
  mockFindOne.mockReset();
  mockUpdate.mockReset();
  mockEmailSend.mockReset();
  mockRandomUUID.mockClear();
  process.env.DEF_FROM = "noreply@example.com";
  process.env.VORPRUEFUNG_REVIEW_PAGE = "https://app.example.com/review/";
});

describe("vorpruefung-ticket afterCreate", () => {
  test("finanzen ticket resolves the municipality's finance contact email", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      title: "Spielplatz Musterdorf",
      municipality: {
        financeContactEmail: "finanzen@musterdorf.de",
        personnelContactEmail: "personal@musterdorf.de",
      },
      fundingGuideline: null,
    });

    await lifecycles.afterCreate({
      result: { id: 1, type: "finanzen", project: 42 },
    });

    expect(mockEmailSend).toHaveBeenCalledTimes(1);
    const emailArgs = mockEmailSend.mock.calls[0][0];
    expect(emailArgs.to).toBe("finanzen@musterdorf.de");
    expect(emailArgs.html).toContain("fixed-test-uuid");

    const [, id, options] = mockUpdate.mock.calls[0];
    expect(id).toBe(1);
    expect(options.data.token).toBe("fixed-test-uuid");
    expect(options.data.reviewerContact).toBe("finanzen@musterdorf.de");
    expect(options.data.sentAt).toBeTruthy();
    expect(options.data.tokenExpiresAt).toBeTruthy();
  });

  test("personal ticket resolves the municipality's personnel contact email", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      title: "Spielplatz Musterdorf",
      municipality: {
        financeContactEmail: "finanzen@musterdorf.de",
        personnelContactEmail: "personal@musterdorf.de",
      },
      fundingGuideline: null,
    });

    await lifecycles.afterCreate({
      result: { id: 2, type: "personal", project: 42 },
    });

    expect(mockEmailSend.mock.calls[0][0].to).toBe("personal@musterdorf.de");
  });

  test("foerdermittelgeber ticket resolves the funding guideline's contact email", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      title: "Spielplatz Musterdorf",
      municipality: { financeContactEmail: "finanzen@musterdorf.de" },
      fundingGuideline: { info: { email: "kontakt@foerdergeber.de" } },
    });

    await lifecycles.afterCreate({
      result: { id: 3, type: "foerdermittelgeber", project: 42 },
    });

    expect(mockEmailSend.mock.calls[0][0].to).toBe("kontakt@foerdergeber.de");
  });

  test("tokenExpiresAt is 2 months after sentAt", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      title: "X",
      municipality: { financeContactEmail: "a@b.de" },
      fundingGuideline: null,
    });

    await lifecycles.afterCreate({ result: { id: 1, type: "finanzen", project: 42 } });

    const options = mockUpdate.mock.calls[0][2];
    const sentAt = new Date(options.data.sentAt);
    const expiresAt = new Date(options.data.tokenExpiresAt);
    const diffDays = (expiresAt - sentAt) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(58);
    expect(diffDays).toBeLessThanOrEqual(62);
  });

  test("no recipient resolvable: does not send email, does not throw", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      title: "X",
      municipality: {},
      fundingGuideline: null,
    });

    await expect(
      lifecycles.afterCreate({ result: { id: 1, type: "finanzen", project: 42 } })
    ).resolves.not.toThrow();
    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
