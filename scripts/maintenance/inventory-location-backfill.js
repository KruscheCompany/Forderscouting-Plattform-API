/**
 * Read-only inventory pass for the location(Ort) backfill (see the admin-hierarchy
 * overhaul plan, section 2). Dumps every free-text location value on
 * user-details, guest-requests, and project.info against the real `location`
 * catalogue, and classifies each as:
 *   - exact:   a location with that title exists AND is scoped to the same
 *              municipality as the record - safe to auto-link later
 *   - cross:   a location with that title exists, but under a DIFFERENT
 *              municipality - needs a human decision (could be a real
 *              same-named place in another municipality, e.g. two villages
 *              called "Neustadt" in different Kreise) - never auto-link
 *   - unmatched: no location with that title exists at all - genuinely
 *              orphaned/stale data (see the "Rellingen" case), needs a human
 *              to either fix the data or create the missing location
 *
 * This makes NO writes - it only reads. Safe to run against any environment
 * whose DATABASE_* vars are set in .env.
 *
 * Usage: node scripts/maintenance/inventory-location-backfill.js [--json out.json]
 */

require("dotenv").config();
const mysql = require("mysql");

function normalize(title) {
  return (title || "").trim().toLowerCase();
}

function query(connection, sql) {
  return new Promise((resolve, reject) => {
    connection.query(sql, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

async function main() {
  const connection = mysql.createConnection({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });

  try {
    const locationRows = await query(
      connection,
      `SELECT l.id, l.title, ml.municipality_id
       FROM locations l
       LEFT JOIN locations_municipality_links ml ON ml.location_id = l.id`
    );

    // Index locations by normalized title -> list of {id, title, municipalityId}
    const byTitle = new Map();
    for (const row of locationRows) {
      const key = normalize(row.title);
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key).push({ id: row.id, title: row.title, municipalityId: row.municipality_id });
    }

    function classify(freeText, municipalityId) {
      const key = normalize(freeText);
      const candidates = byTitle.get(key);
      if (!candidates || candidates.length === 0) {
        return { status: "unmatched", candidates: [] };
      }
      const inScope = candidates.filter((c) => c.municipalityId === municipalityId);
      if (inScope.length > 0) {
        return { status: "exact", candidates: inScope };
      }
      return { status: "cross", candidates };
    }

    async function inventoryTable({ label, query: sql, freeTextField, municipalityField }) {
      const rows = await query(connection, sql);
      const results = { exact: [], cross: [], unmatched: [] };
      for (const row of rows) {
        const freeText = row[freeTextField];
        if (!freeText || !String(freeText).trim()) continue;
        const { status, candidates } = classify(freeText, row[municipalityField]);
        results[status].push({
          id: row.id,
          freeText,
          municipalityId: row[municipalityField] || null,
          candidates: candidates.map((c) => ({ id: c.id, title: c.title, municipalityId: c.municipalityId })),
        });
      }
      return { label, total: rows.length, ...results };
    }

    const userDetailReport = await inventoryTable({
      label: "user_details.location",
      query: `SELECT ud.id, ud.location, ml.municipality_id
              FROM user_details ud
              LEFT JOIN user_details_municipality_links ml ON ml.user_detail_id = ud.id`,
      freeTextField: "location",
      municipalityField: "municipality_id",
    });

    const guestRequestReport = await inventoryTable({
      label: "guest_requests.location",
      query: `SELECT gr.id, gr.location, ml.municipality_id
              FROM guest_requests gr
              LEFT JOIN guest_requests_municipality_links ml ON ml.guest_request_id = gr.id`,
      freeTextField: "location",
      municipalityField: "municipality_id",
    });

    const projectInfoReport = await inventoryTable({
      label: "project.info.location",
      query: `SELECT p.id, cpi.location, mm.municipality_id
              FROM projects p
              JOIN projects_components pc ON pc.entity_id = p.id AND pc.field = 'info'
              JOIN components_project_infos cpi ON cpi.id = pc.component_id
              LEFT JOIN projects_municipality_links mm ON mm.project_id = p.id`,
      freeTextField: "location",
      municipalityField: "municipality_id",
    });

    const reports = [userDetailReport, guestRequestReport, projectInfoReport];

    for (const report of reports) {
      console.log(`\n=== ${report.label} ===`);
      console.log(`  total rows with a value: ${report.total}`);
      console.log(`  exact match (same municipality):  ${report.exact.length}`);
      console.log(`  cross-municipality match (review): ${report.cross.length}`);
      console.log(`  unmatched (no such location at all): ${report.unmatched.length}`);
      if (report.cross.length > 0) {
        console.log("  -- cross-municipality examples --");
        report.cross.slice(0, 5).forEach((r) =>
          console.log(`     id=${r.id} "${r.freeText}" (municipality ${r.municipalityId}) -> found under municipality ${r.candidates.map((c) => c.municipalityId).join(",")}`)
        );
      }
      if (report.unmatched.length > 0) {
        console.log("  -- unmatched examples --");
        report.unmatched.slice(0, 5).forEach((r) => console.log(`     id=${r.id} "${r.freeText}"`));
      }
    }

    const jsonFlagIndex = process.argv.indexOf("--json");
    if (jsonFlagIndex !== -1 && process.argv[jsonFlagIndex + 1]) {
      const fs = require("fs");
      fs.writeFileSync(process.argv[jsonFlagIndex + 1], JSON.stringify(reports, null, 2));
      console.log(`\nFull report written to ${process.argv[jsonFlagIndex + 1]}`);
    }
  } finally {
    connection.end();
  }
}

main().catch((error) => {
  console.error("Inventory pass failed:", error);
  process.exit(1);
});
