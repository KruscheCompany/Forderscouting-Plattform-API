"use strict";

/**
 * Shared email builder for vorpruefung-ticket notifications, used by the
 * afterCreate lifecycle, the controller's `resend` action, and the reminder
 * cron job. Centralizing this avoids the review-link URL being built (and
 * getting broken) three separate ways.
 */

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
  const greeting = greetingName ? `Guten Tag ${greetingName},` : "Hallo,";

  const guidelineClause = guidelineName ? ` im Rahmen der Förderrichtlinie „${guidelineName}“` : "";

  const intro = {
    initial: `anbei erhalten Sie die Projektbeschreibung für einen Förderantrag${guidelineClause} zum Projekt <strong>${projectTitle}</strong>. Wir bitten Sie um eine Einschätzung zu ${topic}. Nutzen Sie hierfür bitte das folgende Formular, damit die Angaben direkt in den Projektkompass Kommune übernommen werden können.`,
    resend: `anbei erhalten Sie erneut die Projektbeschreibung für einen Förderantrag${guidelineClause} zum Projekt <strong>${projectTitle}</strong>. Wir bitten Sie weiterhin um eine Einschätzung zu ${topic}. Nutzen Sie hierfür bitte das folgende Formular, damit die Angaben direkt in den Projektkompass Kommune übernommen werden können.`,
    reminder: `dies ist eine Erinnerung: Ihre Einschätzung zu ${topic} für das Projekt <strong>${projectTitle}</strong>${guidelineClause} steht noch aus. Nutzen Sie hierfür bitte das folgende Formular, damit die Angaben direkt in den Projektkompass Kommune übernommen werden können.`,
  }[variant];

  const subject = {
    initial: `Vorprüfung angefragt: ${projectTitle}`,
    resend: `Vorprüfung angefragt: ${projectTitle}`,
    reminder: `Erinnerung: Vorprüfung ausstehend für ${projectTitle}`,
  }[variant];

  const html = `
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a2e;">
  <div style="background-color: #000055; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <span style="color: #ffffff; font-size: 18px; font-weight: bold;">Projektkompass Kommune</span>
  </div>
  <div style="border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">
    <p style="font-size: 15px; line-height: 1.5; margin-top: 0;">${greeting}</p>
    <p style="font-size: 15px; line-height: 1.5;">${intro}</p>
    ${
      link
        ? `<p style="text-align: center; margin: 28px 0;">
      <a href="${link}" style="background-color: #000055; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; display: inline-block;">Zur Vorprüfung</a>
    </p>
    <p style="font-size: 13px; color: #666666; line-height: 1.4;">Falls der Button nicht funktioniert, nutzen Sie bitte diesen Link:<br /><a href="${link}" style="color: #000055;">${link}</a></p>`
        : `<p style="font-size: 15px; line-height: 1.5; color: #c00;">Der Link zur Vorprüfung konnte nicht erstellt werden. Bitte wenden Sie sich an die Plattform-Administration.</p>`
    }
    <p style="font-size: 15px; line-height: 1.5; margin-top: 24px;">Vielen Dank!</p>
    <p style="font-size: 13px; color: #999999; margin-top: 32px; border-top: 1px solid #eeeeee; padding-top: 16px;">Diese E-Mail wurde automatisch von der Interkommunalen Förderscouting-Plattform Nordfriesland versendet.</p>
  </div>
</div>`.trim();

  return { subject, html };
}

module.exports = { buildVorpruefungEmail };
