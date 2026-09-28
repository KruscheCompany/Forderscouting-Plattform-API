"use strict";

// Replaces strapi::logger's implicit http line with one carrying a per-request
// correlation id, the FE-supplied session id, and the acting user, so an
// incident (e.g. "PUT .../:id 401") can be traced to a person - and their
// whole session - without a separate DB query. See
// docs/LOGGING_EXPANSION_PLAN.md Phases 1 and 3.
const crypto = require("crypto");

module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    const requestId = crypto.randomUUID();
    ctx.state.requestId = requestId;
    ctx.set("X-Request-Id", requestId);

    // FE-generated, one per app load (src/boot/axios.js) - purely a
    // correlation label, never trusted for auth/authorization.
    const sessionId = ctx.request.headers["x-session-id"];
    if (sessionId) ctx.state.sessionId = sessionId;

    const start = Date.now();
    try {
      await next();
    } finally {
      const durationMs = Date.now() - start;
      const user = ctx.state.user;

      strapi.log.http(`${ctx.method} ${ctx.url} (${durationMs}ms) ${ctx.status}`, {
        requestId,
        sessionId,
        userId: user ? user.id : undefined,
        role: user?.role?.type,
        method: ctx.method,
        path: ctx.path,
        status: ctx.status,
        durationMs,
      });
    }
  };
};
