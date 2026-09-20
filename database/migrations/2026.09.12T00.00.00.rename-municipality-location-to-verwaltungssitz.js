"use strict";

const TABLE = "municipalities";

// municipality.location was a free-text field long assumed to duplicate the
// real location(Ort)/city relation - it doesn't. It records the Amt's
// Verwaltungssitz (administrative office seat), a fact independent of which
// Gemeinden the Amt actually governs (verified: Amt Pinnau's location =
// "Rellingen", the town its office sits in - not one of its five Gemeinden).
// Renaming for clarity and dropping `unique` (nothing prevents two Ämter
// sharing an office town) - a straight column rename to keep the existing
// data, not an add+backfill+drop.
async function up(trx) {
  const hasOld = await trx.schema.hasColumn(TABLE, "location");
  const hasNew = await trx.schema.hasColumn(TABLE, "verwaltungssitz");
  if (hasOld && !hasNew) {
    await trx.schema.alterTable(TABLE, (table) => {
      table.renameColumn("location", "verwaltungssitz");
    });
  }
}

async function down(trx) {
  const hasNew = await trx.schema.hasColumn(TABLE, "verwaltungssitz");
  const hasOld = await trx.schema.hasColumn(TABLE, "location");
  if (hasNew && !hasOld) {
    await trx.schema.alterTable(TABLE, (table) => {
      table.renameColumn("verwaltungssitz", "location");
    });
  }
}

module.exports = { up, down };
