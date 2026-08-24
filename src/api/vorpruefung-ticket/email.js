"use strict";

/**
 * Shared email builder for vorpruefung-ticket notifications, used by the
 * afterCreate lifecycle, the controller's `resend` action, and the reminder
 * cron job. Centralizing this avoids the review-link URL being built (and
 * getting broken) three separate ways.
 */

const { buildEmailHtml, escapeHtml } = require("../../utils/email-template");

const ASSESSMENT_TOPICS = {
  finanzen: "den Finanzierungsbedarf des Projekts",
  personal: "den Personalbedarf des Projekts",
  foerdermittelgeber: "die fachliche Eignung des Projekts im Rahmen dieser Förderrichtlinie",
};

function buildReviewLink(token) {
  const base = process.env.VORPRUEFUNG_REVIEW_PAGE;
  if (!base) {
    strapi.log.error(
      "VORPRUEFUNG_REVIEW_PAGE is not set — vorpruefung review links will be broken. Set it in .env, e.g. https://<frontend-host>/review/"
    );
    return null;
  }
  return `${base}${base.endsWith("/") ? "" : "/"}${token}`;
}

function buildVorpruefungEmail({ projectTitle, guidelineName, type, token, variant, firstName, lastName }) {
  const topic = ASSESSMENT_TOPICS[type] || type;
  const link = buildReviewLink(token);

  const greetingName = [firstName, lastName].filter(Boolean).join(" ");
  const greeting = greetingName ? `Guten Tag ${escapeHtml(greetingName)},` : "Hallo,";

  const safeProjectTitle = escapeHtml(projectTitle);
  const guidelineClause = guidelineName ? ` im Rahmen der Förderrichtlinie „${escapeHtml(guidelineName)}“` : "";

  const intro = {
    initial: `anbei erhalten Sie die Projektbeschreibung für einen Förderantrag${guidelineClause} zum Projekt <strong>${safeProjectTitle}</strong>. Wir bitten Sie um eine Einschätzung zu ${topic}. Nutzen Sie hierfür bitte das folgende Formular, damit die Angaben direkt in den Projektkompass Kommune übernommen werden können.`,
    resend: `anbei erhalten Sie erneut die Projektbeschreibung für einen Förderantrag${guidelineClause} zum Projekt <strong>${safeProjectTitle}</strong>. Wir bitten Sie weiterhin um eine Einschätzung zu ${topic}. Nutzen Sie hierfür bitte das folgende Formular, damit die Angaben direkt in den Projektkompass Kommune übernommen werden können.`,
    reminder: `dies ist eine Erinnerung: Ihre Einschätzung zu ${topic} für das Projekt <strong>${safeProjectTitle}</strong>${guidelineClause} steht noch aus. Nutzen Sie hierfür bitte das folgende Formular, damit die Angaben direkt in den Projektkompass Kommune übernommen werden können.`,
  }[variant];

  const subject = {
    initial: `Vorprüfung angefragt: ${projectTitle}`,
    resend: `Vorprüfung angefragt: ${projectTitle}`,
    reminder: `Erinnerung: Vorprüfung ausstehend für ${projectTitle}`,
  }[variant];

  const bodyHtml = link
    ? `<p style="margin-top: 0;">${intro}</p>`
    : `<p style="margin-top: 0;">${intro}</p><p style="color: #c00;">Der Link zur Vorprüfung konnte nicht erstellt werden. Bitte wenden Sie sich an die Plattform-Administration.</p>`;

  const html = buildEmailHtml({
    greeting,
    bodyHtml,
    cta: link ? { label: "Zur Vorprüfung", url: link } : null,
  });

  return { subject, html };
}

module.exports = { buildVorpruefungEmail };
