"use strict";

// Backfill: link user-details/guest-requests/projects to a real location(Ort)
// row wherever their free-text location string exactly matches a location's
// title AND that location belongs to the same municipality already assigned
// to the record. Anything ambiguous (title matches a location under a
// DIFFERENT municipality) or unmatched (no such location exists at all) is
// left untouched - it needs a human, not a guess. Run
// scripts/maintenance/inventory-location-backfill.js for the full
// before/after breakdown of what stays unresolved.
//
// This runs from bootstrap, not from a database migration: Strapi runs
// migrations BEFORE it syncs the schema, so on an environment that has never
// had the assignedLocation/location relations the link tables below do not
// exist yet during any migration - a migration that needed them made the boot
// (and so the schema sync that would create them) fail. Bootstrap runs after
// the sync. Every statement skips rows that already have a link, so running it
// again is harmless; a store flag just stops it from running on every boot.

const REQUIRED_TABLES = [
  "user_details_assigned_location_links",
  "guest_requests_assigned_location_links",
  "projects_location_links",
];

const DONE_KEY = { type: "app", name: "backfills", key: "location-relations" };

const STATEMENTS = [
  `
    INSERT INTO user_details_assigned_location_links (user_detail_id, location_id, user_detail_order)
    SELECT ud.id, loc.id, 1
    FROM user_details ud
    JOIN user_details_municipality_links uml ON uml.user_detail_id = ud.id
    JOIN locations loc ON LOWER(TRIM(loc.title)) = LOWER(TRIM(ud.location))
    JOIN locations_municipality_links lml
      ON lml.location_id = loc.id AND lml.municipality_id = uml.municipality_id
    WHERE ud.location IS NOT NULL AND TRIM(ud.location) != ''
      AND NOT EXISTS (
        SELECT 1 FROM user_details_assigned_location_links x WHERE x.user_detail_id = ud.id
      )
  `,
  `
    INSERT INTO guest_requests_assigned_location_links (guest_request_id, location_id, guest_request_order)
    SELECT gr.id, loc.id, 1
    FROM guest_requests gr
    JOIN guest_requests_municipality_links gml ON gml.guest_request_id = gr.id
    JOIN locations loc ON LOWER(TRIM(loc.title)) = LOWER(TRIM(gr.location))
    JOIN locations_municipality_links lml
      ON lml.location_id = loc.id AND lml.municipality_id = gml.municipality_id
    WHERE gr.location IS NOT NULL AND TRIM(gr.location) != ''
      AND NOT EXISTS (
        SELECT 1 FROM guest_requests_assigned_location_links x WHERE x.guest_request_id = gr.id
      )
  `,
  `
    INSERT INTO projects_location_links (project_id, location_id, project_order)
    SELECT p.id, loc.id, 1
    FROM projects p
    JOIN projects_components pc ON pc.entity_id = p.id AND pc.field = 'info'
    JOIN components_project_infos cpi ON cpi.id = pc.component_id
    JOIN projects_municipality_links pml ON pml.project_id = p.id
    JOIN locations loc ON LOWER(TRIM(loc.title)) = LOWER(TRIM(cpi.location))
    JOIN locations_municipality_links lml
      ON lml.location_id = loc.id AND lml.municipality_id = pml.municipality_id
    WHERE cpi.location IS NOT NULL AND TRIM(cpi.location) != ''
      AND NOT EXISTS (
        SELECT 1 FROM projects_location_links x WHERE x.project_id = p.id
      )
  `,
];

/**
 * @returns {Promise<boolean>} true if the backfill ran now, false if it was
 *   already done or is not possible yet. Never throws: a failure here must not
 *   stop the app from booting, and is retried on the next boot.
 */
async function backfillLocationRelations(strapi) {
  try {
    if (await strapi.store.get(DONE_KEY)) return false;

    const knex = strapi.db.connection;
    for (const table of REQUIRED_TABLES) {
      if (!(await knex.schema.hasTable(table))) {
        strapi.log.warn(`Location backfill skipped: ${table} does not exist yet.`);
        return false;
      }
    }

    await knex.transaction(async (trx) => {
      for (const statement of STATEMENTS) {
        await trx.raw(statement);
      }
    });
    await strapi.store.set({ ...DONE_KEY, value: { doneAt: new Date().toISOString() } });
    strapi.log.info("Location backfill done.");
    return true;
  } catch (error) {
    strapi.log.error(`Location backfill failed, will retry on next boot: ${error.message}`);
    return false;
  }
}

module.exports = { backfillLocationRelations, REQUIRED_TABLES };
