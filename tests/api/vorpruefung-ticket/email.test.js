"use strict";

process.env.VORPRUEFUNG_REVIEW_PAGE = "https://app.example.com/review/";
global.strapi = { log: { error: jest.fn() } };

const { buildVorpruefungEmail } = require("../../../src/api/vorpruefung-ticket/email.js");

describe("buildVorpruefungEmail", () => {
  test("greets the recipient by first and last name when both are known", () => {
    const { html } = buildVorpruefungEmail({
      projectTitle: "Spielplatz Musterdorf",
      guidelineName: "Städtebauförderung 2026",
      type: "personal",
      token: "tok-1",
      variant: "initial",
      firstName: "Anna",
      lastName: "Muster",
    });
    expect(html).toContain("Guten Tag Anna Muster,");
  });

  test("falls back to a generic greeting when no name is known", () => {
    const { html } = buildVorpruefungEmail({
      projectTitle: "Spielplatz Musterdorf",
      guidelineName: null,
      type: "finanzen",
      token: "tok-2",
      variant: "initial",
      firstName: null,
      lastName: null,
    });
    expect(html).toContain("Hallo,");
    expect(html).not.toContain("Guten Tag");
  });

  test("mentions the funding guideline name when known", () => {
    const { html } = buildVorpruefungEmail({
      projectTitle: "Spielplatz Musterdorf",
      guidelineName: "Städtebauförderung 2026",
      type: "finanzen",
      token: "tok-3",
      variant: "initial",
      firstName: null,
      lastName: null,
    });
    expect(html).toContain("Städtebauförderung 2026");
  });

  test("omits the guideline clause when no guideline is known, without leaving a dangling phrase", () => {
    const { html } = buildVorpruefungEmail({
      projectTitle: "Spielplatz Musterdorf",
      guidelineName: null,
      type: "finanzen",
      token: "tok-4",
      variant: "initial",
      firstName: null,
      lastName: null,
    });
    expect(html).not.toContain("im Rahmen der Förderrichtlinie");
  });

  test.each([
    ["finanzen", "Finanzierungsbedarf"],
    ["personal", "Personalbedarf"],
    ["foerdermittelgeber", "fachliche Eignung"],
  ])("%s variant names the right assessment topic", (type, expectedFragment) => {
    const { html } = buildVorpruefungEmail({
      projectTitle: "X",
      guidelineName: null,
      type,
      token: "tok-5",
      variant: "initial",
      firstName: null,
      lastName: null,
    });
    expect(html).toContain(expectedFragment);
  });

  test("reminder variant says it's a reminder", () => {
    const { html } = buildVorpruefungEmail({
      projectTitle: "X",
      guidelineName: null,
      type: "finanzen",
      token: "tok-6",
      variant: "reminder",
      firstName: null,
      lastName: null,
    });
    expect(html).toContain("Erinnerung");
  });

  test("includes the review link built from the token", () => {
    const { html } = buildVorpruefungEmail({
      projectTitle: "X",
      guidelineName: null,
      type: "finanzen",
      token: "tok-7",
      variant: "initial",
      firstName: null,
      lastName: null,
    });
    expect(html).toContain("https://app.example.com/review/tok-7");
  });

  test("closes with a thank-you line", () => {
    const { html } = buildVorpruefungEmail({
      projectTitle: "X",
      guidelineName: null,
      type: "finanzen",
      token: "tok-8",
      variant: "initial",
      firstName: null,
      lastName: null,
    });
    expect(html).toContain("Vielen Dank!");
  });
});
