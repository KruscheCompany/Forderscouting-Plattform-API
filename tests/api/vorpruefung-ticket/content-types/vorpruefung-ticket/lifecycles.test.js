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

function makeEvent({ id, type, projectId }) {
  return {
    params: { data: { project: projectId } },
    result: { id, type },
  };
}

describe("vorpruefung-ticket afterCreate", () => {
  test("reads the project id from event.params.data.project, not event.result", async () => {
    // event.result never carries the `project` relation on the real create
    // path (no `project` column exists on the base table -- it's stored via
    // a join table -- and the FE create POST never requests populate).
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      title: "Spielplatz Musterdorf",
      municipality: { financeContactEmail: "finanzen@musterdorf.de" },
      fundingGuideline: null,
    });

    await lifecycles.afterCreate(makeEvent({ id: 1, type: "finanzen", projectId: 42 }));

    expect(mockFindOne).toHaveBeenCalledWith(
      "api::project.project",
      42,
      expect.any(Object)
    );
  });

  test("no project id resolvable: does not call findOne, does not throw", async () => {
    await expect(
      lifecycles.afterCreate({ params: { data: {} }, result: { id: 1, type: "finanzen" } })
    ).resolves.not.toThrow();
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  test("finanzen ticket resolves the municipality's finance contact email and name", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      title: "Spielplatz Musterdorf",
      municipality: {
        financeContactEmail: "finanzen@musterdorf.de",
        financeContactFirstName: "Anna",
        financeContactLastName: "Muster",
        personnelContactEmail: "personal@musterdorf.de",
      },
      fundingGuideline: null,
    });

    await lifecycles.afterCreate(makeEvent({ id: 1, type: "finanzen", projectId: 42 }));

    expect(mockEmailSend).toHaveBeenCalledTimes(1);
    const emailArgs = mockEmailSend.mock.calls[0][0];
    expect(emailArgs.to).toBe("finanzen@musterdorf.de");
    expect(emailArgs.html).toContain("fixed-test-uuid");
    expect(emailArgs.html).toContain("Guten Tag Anna Muster,");

    const [, id, options] = mockUpdate.mock.calls[0];
    expect(id).toBe(1);
    expect(options.data.token).toBe("fixed-test-uuid");
    expect(options.data.reviewerContact).toBe("finanzen@musterdorf.de");
    expect(options.data.reviewerFirstName).toBe("Anna");
    expect(options.data.reviewerLastName).toBe("Muster");
    expect(options.data.sentAt).toBeTruthy();
    expect(options.data.tokenExpiresAt).toBeTruthy();
  });

  test("passes the funding guideline's title through to the email", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      title: "Spielplatz Musterdorf",
      municipality: { financeContactEmail: "finanzen@musterdorf.de" },
      fundingGuideline: [{ title: "Städtebauförderung 2026", info: { email: "kontakt@foerdergeber.de" } }],
    });

    await lifecycles.afterCreate(makeEvent({ id: 1, type: "finanzen", projectId: 42 }));

    expect(mockEmailSend.mock.calls[0][0].html).toContain("Städtebauförderung 2026");
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

    await lifecycles.afterCreate(makeEvent({ id: 2, type: "personal", projectId: 42 }));

    expect(mockEmailSend.mock.calls[0][0].to).toBe("personal@musterdorf.de");
  });

  test("foerdermittelgeber ticket resolves the funding guideline's contact email", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      title: "Spielplatz Musterdorf",
      municipality: { financeContactEmail: "finanzen@musterdorf.de" },
      fundingGuideline: [{ info: { email: "kontakt@foerdergeber.de" } }],
    });

    await lifecycles.afterCreate(makeEvent({ id: 3, type: "foerdermittelgeber", projectId: 42 }));

    expect(mockEmailSend.mock.calls[0][0].to).toBe("kontakt@foerdergeber.de");
  });

  test("tokenExpiresAt is 2 months after sentAt", async () => {
    mockFindOne.mockResolvedValueOnce({
      id: 42,
      title: "X",
      municipality: { financeContactEmail: "a@b.de" },
      fundingGuideline: null,
    });

    await lifecycles.afterCreate(makeEvent({ id: 1, type: "finanzen", projectId: 42 }));

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
      lifecycles.afterCreate(makeEvent({ id: 1, type: "finanzen", projectId: 42 }))
    ).resolves.not.toThrow();
    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
