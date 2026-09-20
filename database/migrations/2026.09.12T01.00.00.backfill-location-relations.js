"use strict";

// Backfill: link user-details/guest-requests/projects to a real location(Ort)
// row wherever their free-text location string exactly matches a location's
// title AND that location belongs to the same municipality already assigned
// to the record. Anything ambiguous (title matches a location under a
// DIFFERENT municipality) or unmatched (no such location exists at all) is
// left untouched - it needs a human, not a guess. Run
// inventory_location_backfill.js for the full before/after breakdown of what
// stays unresolved.
//
// Depends on the assignedLocation/location relation tables added in the
// previous migration's schema.json changes, which Strapi's own schema sync
// creates AFTER migrations run on a given boot - so this only works from the
// *second* boot onward once those columns exist. Fail loudly rather than
// silently no-op (which would mark this migration "done" without having
// backfilled anything).
const REQUIRED_TABLES = [
  "user_details_assigned_location_links",
  "guest_requests_assigned_location_links",
  "projects_location_links",
];

async function up(trx) {
  for (const table of REQUIRED_TABLES) {
    const exists = await trx.schema.hasTable(table);
    if (!exists) {
      throw new Error(
        `${table} does not exist yet - boot Strapi once to let it sync the new ` +
        `relation schema, then restart to run this backfill.`
      );
    }
  }

  await trx.raw(`
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
  `);

  await trx.raw(`
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
  `);

  await trx.raw(`
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
  `);
}

async function down() {}

module.exports = { up, down };
