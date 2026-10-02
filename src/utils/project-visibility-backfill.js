"use strict";

// Projects no longer have an "only for me" visibility. Every project that still
// carries it becomes "listed only", and a one-time system notice tells all
// users about the change. Runs from bootstrap on every boot (after the schema
// sync, so the system_notices table exists): once nothing is left to convert
// it only costs one indexed UPDATE and one SELECT.
//
// The notice is created first so a failed conversion never leaves projects
// switched without announcement; both steps are safe to repeat.

const NOTICE_UID = "api::system-notice.system-notice";
const NOTICE_KEY = "projectVisibilityListed";

async function backfillProjectVisibility(strapi) {
  try {
    const existing = await strapi.db.query(NOTICE_UID).findOne({ where: { key: NOTICE_KEY } });
    if (!existing) {
      await strapi.db.query(NOTICE_UID).create({ data: { key: NOTICE_KEY } });
    }

    const converted = await strapi.db
      .connection("projects")
      .where({ visibility: "only for me" })
      .update({ visibility: "listed only" });
    if (converted > 0) {
      strapi.log.info(`Project visibility backfill: ${converted} project(s) switched from "only for me" to "listed only".`);
    }
    return converted;
  } catch (error) {
    strapi.log.error(`Project visibility backfill failed, will retry on next boot: ${error.message}`);
    return 0;
  }
}

module.exports = { backfillProjectVisibility };
