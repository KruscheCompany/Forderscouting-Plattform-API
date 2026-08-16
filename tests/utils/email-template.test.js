"use strict";

const { buildEmailHtml } = require("../../src/utils/email-template");

describe("buildEmailHtml", () => {
  test("uses the default greeting when none is given", () => {
    const html = buildEmailHtml({ bodyHtml: "<p>Hallo Welt</p>" });
    expect(html).toContain("Hallo,");
  });

  test("uses a custom greeting when given", () => {
    const html = buildEmailHtml({ greeting: "Guten Tag Anna,", bodyHtml: "<p>x</p>" });
    expect(html).toContain("Guten Tag Anna,");
    expect(html).not.toContain(">Hallo,<");
  });

  test("includes the body content verbatim", () => {
    const html = buildEmailHtml({ bodyHtml: "<p>Ein Test-Inhalt</p>" });
    expect(html).toContain("Ein Test-Inhalt");
  });

  test("omits any button/link markup when no cta is given", () => {
    const html = buildEmailHtml({ bodyHtml: "<p>x</p>" });
    expect(html).not.toContain("Falls der Button nicht funktioniert");
  });

  test("renders the cta button and fallback link when given", () => {
    const html = buildEmailHtml({
      bodyHtml: "<p>x</p>",
      cta: { label: "Zur Vorprüfung", url: "https://app.example.com/review/tok-1" },
    });
    expect(html).toContain("Zur Vorprüfung");
    expect(html).toContain("https://app.example.com/review/tok-1");
    expect(html).toContain("Falls der Button nicht funktioniert");
  });

  test("always includes the platform header and footer disclaimer", () => {
    const html = buildEmailHtml({ bodyHtml: "<p>x</p>" });
    expect(html).toContain("Projektkompass Kommune");
    expect(html).toContain(
      "Diese E-Mail wurde automatisch von der Interkommunalen Förderscouting-Plattform Nordfriesland versendet."
    );
  });
});
