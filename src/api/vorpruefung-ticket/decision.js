"use strict";

/**
 * Shared validation for a Vorprüfung decision payload, used by both the public
 * token endpoint and the admin override endpoint. Lives at the api root for the
 * same reason `recipient.js` does: Strapi only auto-loads `index.js` here, so
 * this can be required directly from the controller.
 */

// "sent" is deliberately excluded — neither a reviewer nor an admin may reset a
// ticket back to the initial state through these endpoints.
const ALLOWED_DECISIONS = ["positiv", "negativ", "ruecksprache"];

const MAX_SUGGESTED_DATES = 5;

function validateDecision(body) {
  const { decisionType, responseText, wantsPhoneCall, wantsOnsiteMeeting, suggestedDates } = body || {};

  if (!decisionType) {
    return { error: "Bitte wählen Sie eine Entscheidung aus." };
  }
  if (!ALLOWED_DECISIONS.includes(decisionType)) {
    return { error: "Ungültige Entscheidung." };
  }
  if (!responseText) {
    return { error: "Bitte geben Sie eine Antwort ein." };
  }
  if (decisionType === "ruecksprache") {
    if (!wantsPhoneCall && !wantsOnsiteMeeting) {
      return { error: "Bitte wählen Sie mindestens eine Kontaktoption aus." };
    }
    if (
      !Array.isArray(suggestedDates) ||
      suggestedDates.length < 1 ||
      suggestedDates.length > MAX_SUGGESTED_DATES ||
      suggestedDates.some((value) => Number.isNaN(new Date(value).getTime()))
    ) {
      return { error: "Bitte wählen Sie mindestens einen Terminvorschlag aus." };
    }
  }

  return {
    data: {
      status: decisionType,
      responseText,
      wantsPhoneCall: !!wantsPhoneCall,
      wantsOnsiteMeeting: !!wantsOnsiteMeeting,
      suggestedDates: decisionType === "ruecksprache" ? suggestedDates : null,
    },
  };
}

module.exports = { validateDecision, ALLOWED_DECISIONS, MAX_SUGGESTED_DATES };
