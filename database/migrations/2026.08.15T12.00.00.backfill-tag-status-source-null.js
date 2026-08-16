"use strict";

// tag.js's `create` action never applied the schema's status/source defaults
// (the DB column has no SQL-level default and entityService doesn't fill one
// in on a plain create), so every tag added through the normal "add tag" flow
// kept landing with status/source = NULL - including new rows created after
// the earlier 2026.08.13T14.50.28 backfill already ran. That migration is a
// one-time no-op now, so re-backfill here to cover everything it missed;
// tag.js's `create` override (added alongside this migration) stops new NULLs.
async function up(trx) {
  await trx.raw("UPDATE tags SET status = 'approved' WHERE status IS NULL");
  await trx.raw("UPDATE tags SET source = 'manual' WHERE source IS NULL");
}

async function down() {}

module.exports = { up, down };
