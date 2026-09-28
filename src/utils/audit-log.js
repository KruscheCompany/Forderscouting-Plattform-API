"use strict";

// One-line structured logs at the decision points controllers already contain
// (permission checks, status changes) - the piece the http access line alone
// can't answer ("why was this denied"). See docs/LOGGING_EXPANSION_PLAN.md
// Phase 2. Dev keeps everything readable in the message text itself, since
// dev stays plain console and drops extra fields; prod/stage additionally get
// the fields as structured JSON.
function auditLog(strapi, ctx, event, fields = {}) {
  const meta = {
    level: "audit",
    event,
    requestId: ctx?.state?.requestId,
    sessionId: ctx?.state?.sessionId,
    userId: ctx?.state?.user?.id,
    ...fields,
  };

  const summary = Object.entries(meta)
    .filter(([key, value]) => key !== "level" && value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");

  strapi.log.info(`AUDIT ${summary}`, meta);
}

module.exports = { auditLog };
