"use strict";

// Backfill: give every live Vorprüfung request its `live_key`, the column whose
// unique index lets the database refuse a second live request for the same
// project and type. Rows created before the column existed have it NULL.
//
// Should an earlier race have left two live requests for one project and type,
// the newest stays live and the older ones are retired as re-asked, which is
// what the newer request effectively did. Runs from bootstrap on every boot:
// once nothing is missing a key it only costs one indexed SELECT.

const UID = "api::vorpruefung-ticket.vorpruefung-ticket";

async function backfillVorpruefungLiveKeys(strapi) {
  try {
    const knex = strapi.db.connection;
    const rows = await knex("vorpruefung_tickets as t")
      .join("vorpruefung_tickets_project_links as l", "l.vorpruefung_ticket_id", "t.id")
      .whereNull("t.superseded_at")
      .whereNull("t.live_key")
      .orderBy("t.id", "desc")
      .select("t.id", "t.type", "l.project_id as projectId");
    if (rows.length === 0) return 0;

    const taken = new Set(
      (
        await knex("vorpruefung_tickets").whereNotNull("live_key").select("live_key")
      ).map((row) => row.live_key)
    );

    let keyed = 0;
    let retired = 0;
    for (const row of rows) {
      const liveKey = `${row.projectId}:${row.type}`;
      if (taken.has(liveKey)) {
        await strapi.db.query(UID).updateMany({
          where: { id: row.id, supersededAt: null },
          data: { supersededAt: new Date(), supersededReason: "resend" },
        });
        retired += 1;
        continue;
      }
      await strapi.db.query(UID).updateMany({
        where: { id: row.id, liveKey: null },
        data: { liveKey },
      });
      taken.add(liveKey);
      keyed += 1;
    }

    strapi.log.info(`Vorprüfung live-key backfill: ${keyed} keyed, ${retired} duplicate(s) retired.`);
    return keyed;
  } catch (error) {
    strapi.log.error(`Vorprüfung live-key backfill failed, will retry on next boot: ${error.message}`);
    return 0;
  }
}

module.exports = { backfillVorpruefungLiveKeys };
