"use strict";

const TABLE = "components_project_details";

// Strapi runs custom migrations before it auto-adds new columns from
// schema.json, so non_investive doesn't exist in the DB yet at this point -
// create it here so the UPDATE below has somewhere to write. Existing rows
// only ever had the single `investive` boolean, so the inverse is the only
// sane backfill: a project marked non-investive under the old model becomes
// nonInvestive=true, investive=false here (matches src/components/project/details.json).
async function up(trx) {
  const hasColumn = await trx.schema.hasColumn(TABLE, "non_investive");
  if (!hasColumn) {
    await trx.schema.alterTable(TABLE, (table) => {
      table.boolean("non_investive");
    });
  }

  await trx.raw(
    `UPDATE ?? SET non_investive = NOT investive WHERE investive IS NOT NULL`,
    [TABLE]
  );

  await trx.raw(
    `UPDATE ?? SET non_investive = false WHERE non_investive IS NULL`,
    [TABLE]
  );
}

async function down() {}

module.exports = { up, down };
