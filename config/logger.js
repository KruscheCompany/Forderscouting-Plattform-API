"use strict";

// Takes over from Strapi's implicit default so log format is explicit and
// versioned. Structured JSON (grep/jq-able) on prod/stage; pretty console
// output stays for local `quasar dev`-style iteration. See
// docs/LOGGING_EXPANSION_PLAN.md Phase 1.
const { winston, formats } = require("@strapi/logger");

const appEnv = (process.env.APP_ENV || "").toLowerCase();
const isStructured = appEnv === "prod" || appEnv === "stage";

const renameTimestamp = winston.format((info) => {
  if (info.timestamp) {
    info.ts = info.timestamp;
    delete info.timestamp;
  }
  return info;
});

// winston's json() drops an Error's non-enumerable message/stack, so a bare
// `strapi.log.error(err)` (what strapi::errors does for every 500) came out as
// `{"level":"error","ts":...}` with no cause.
const serializeError = (err) => ({
  name: err.name,
  message: err.message,
  stack: err.stack,
  ...(err.code !== undefined && { code: err.code }),
});

const serializeErrors = winston.format((info) => {
  if (info instanceof Error) {
    return Object.assign(info, { message: info.message, stack: info.stack, name: info.name });
  }
  for (const key of ["error", "err"]) {
    if (info[key] instanceof Error) info[key] = serializeError(info[key]);
  }
  return info;
});

// `strapi.log.error("msg", err.message)` - extra non-object args - are silently
// dropped by winston without a splat format; fold them into the message.
const SPLAT = Symbol.for("splat");
const foldExtraArgs = winston.format((info) => {
  const extras = info[SPLAT];
  if (!Array.isArray(extras) || extras.length === 0) return info;
  const rest = [];
  for (const arg of extras) {
    if (typeof arg === "string" || typeof arg === "number" || typeof arg === "boolean") {
      info.message = `${info.message} ${arg}`;
    } else if (extras.length > 1) {
      rest.push(arg instanceof Error ? serializeError(arg) : arg);
    }
  }
  if (rest.length) info.extra = rest;
  return info;
});

module.exports = {
  level: "http",
  format: isStructured
    ? winston.format.combine(
        winston.format.errors({ stack: true }),
        foldExtraArgs(),
        serializeErrors(),
        winston.format.timestamp(),
        renameTimestamp(),
        winston.format.json()
      )
    : formats.prettyPrint(),
  transports: [new winston.transports.Console()],
};
