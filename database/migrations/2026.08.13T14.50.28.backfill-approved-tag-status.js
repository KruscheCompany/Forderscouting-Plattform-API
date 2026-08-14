"use strict";

// The tag content-type's `status` field was added with `default: "approved"`,
// but that default only applies to new rows Strapi inserts - it never
// backfilled tags that already existed, leaving them with status = NULL.
// tag.js:find() filters `status: ctx.query.status || "approved"` by default,
// so those rows silently stopped matching the default listing.
async function up(trx) {
  // Strapi runs custom migrations before it auto-adds new columns from
  // schema.json, so `status` doesn't exist in the DB yet at this point -
  // create it here (matching Strapi's own enumeration -> string mapping)
  // so the UPDATE below has somewhere to write.
  const hasColumn = await trx.schema.hasColumn("tags", "status");
  if (!hasColumn) {
    await trx.schema.alterTable("tags", (table) => {
      table.string("status");
    });
  }

  await trx.raw("UPDATE tags SET status = 'approved' WHERE status IS NULL");
}

async function down() {}

module.exports = { up, down };
