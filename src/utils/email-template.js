"use strict";

/**
 * Shared branded HTML shell for every email the platform sends. Pulled out of
 * vorpruefung-ticket/email.js so all senders (notifications, requests, tag
 * decisions, bulk mail, password reset) share one look instead of each
 * hand-rolling their own markup.
 */

/**
 * Escapes a plain-text value for safe interpolation into an HTML email body.
 * Use this on any dynamic value (username, title, comment, etc.) before
 * embedding it in a bodyHtml template literal - it is NOT applied to
 * bodyHtml/greeting itself, since those are meant to already contain markup.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtml({ greeting = "Hallo,", bodyHtml, cta = null }) {
  const ctaBlock = cta
    ? `<p style="text-align: center; margin: 28px 0;">
      <a href="${cta.url}" style="background-color: #000055; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; display: inline-block;">${cta.label}</a>
    </p>
    <p style="font-size: 13px; color: #666666; line-height: 1.4;">Falls der Button nicht funktioniert, nutzen Sie bitte diesen Link:<br /><a href="${cta.url}" style="color: #000055;">${cta.url}</a></p>`
    : "";

  return `
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a2e;">
  <div style="background-color: #000055; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <span style="color: #ffffff; font-size: 18px; font-weight: bold;">Projektkompass Kommune</span>
  </div>
  <div style="border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">
    <p style="font-size: 15px; line-height: 1.5; margin-top: 0;">${greeting}</p>
    <div style="font-size: 15px; line-height: 1.5;">${bodyHtml}</div>
    ${ctaBlock}
    <p style="font-size: 15px; line-height: 1.5; margin-top: 24px;">Vielen Dank!</p>
    <p style="font-size: 13px; color: #999999; margin-top: 32px; border-top: 1px solid #eeeeee; padding-top: 16px;">Diese E-Mail wurde automatisch von der Interkommunalen Förderscouting-Plattform Nordfriesland versendet.</p>
  </div>
</div>`.trim();
}

module.exports = { buildEmailHtml, escapeHtml };
