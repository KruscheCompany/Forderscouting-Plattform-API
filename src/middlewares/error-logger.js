"use strict";

// Single place every API error gets logged with request context. Sits inside
// strapi::errors: it logs a thrown error and rethrows, so strapi::errors still
// builds the response. strapi::errors alone logs only unexpected 500s, with no
// route/user, and logs nothing for ApplicationError/HttpError (4xx). Also
// covers controllers that answer with ctx.badRequest()/ctx.forbidden()/... and
// never throw.
const { errors } = require("@strapi/utils");

module.exports = (config, { strapi }) => {
  const context = (ctx) => ({
    requestId: ctx.state.requestId,
    sessionId: ctx.state.sessionId,
    userId: ctx.state.user?.id,
    role: ctx.state.user?.role?.type,
    method: ctx.method,
    path: ctx.path,
  });

  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      const expected = error instanceof errors.ApplicationError || error instanceof errors.HttpError;
      if (expected) {
        strapi.log.warn(`${error.name}: ${error.message}`, {
          ...context(ctx),
          status: error.status,
          errorName: error.name,
          details: error.details,
        });
      } else {
        strapi.log.error(`${error?.name || "Error"}: ${error?.message || error}`, {
          ...context(ctx),
          errorName: error?.name,
          stack: error?.stack,
        });
      }
      throw error;
    }

    if (ctx.status >= 400 && ctx.body?.error) {
      const { name, message, details } = ctx.body.error;
      const log = ctx.status >= 500 ? strapi.log.error : strapi.log.warn;
      log.call(strapi.log, `${name}: ${message}`, {
        ...context(ctx),
        status: ctx.status,
        errorName: name,
        details,
      });
    }
  };
};
