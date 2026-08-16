"use strict";

// tagPendingApproval/tagReviewDecision were added to the notifications app/email
// components with default: true, but that only applies to new component rows -
// every existing user's row was left with NULL in both columns. Every gate in
// the code does a strict `== true` check, so NULL silently reads as "off"
// everywhere (toast/email skip in the tag lifecycle, and the pending-tag/
// decision rows never get queried in user-detail.js's notification()).
async function up(trx) {
  // Strapi runs custom migrations before it auto-adds new columns from
  // schema.json, so these two booleans don't exist in the DB yet at this
  // point - create them here so the UPDATEs below have somewhere to write.
  // app defaults to enabled, email defaults to disabled - matches
  // src/components/notifications/{app,email}.json.
  const defaultByTable = {
    components_notifications_apps: true,
    components_notifications_emails: false,
  };

  for (const [table, defaultValue] of Object.entries(defaultByTable)) {
    for (const column of ["tag_pending_approval", "tag_review_decision"]) {
      const hasColumn = await trx.schema.hasColumn(table, column);
      if (!hasColumn) {
        await trx.schema.alterTable(table, (t) => {
          t.boolean(column);
        });
      }
    }

    await trx.raw(
      `UPDATE ?? SET tag_pending_approval = ? WHERE tag_pending_approval IS NULL`,
      [table, defaultValue]
    );
    await trx.raw(
      `UPDATE ?? SET tag_review_decision = ? WHERE tag_review_decision IS NULL`,
      [table, defaultValue]
    );
  }
}

async function down() {}

module.exports = { up, down };
