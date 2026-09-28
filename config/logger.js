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

module.exports = {
  level: "http",
  format: isStructured
    ? winston.format.combine(winston.format.timestamp(), renameTimestamp(), winston.format.json())
    : formats.prettyPrint(),
  transports: [new winston.transports.Console()],
};
