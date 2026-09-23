"use strict";

// Intentionally empty. This used to backfill the location(Ort) relations, but
// Strapi runs migrations before it syncs the schema, so on an environment that
// had never had those relations the link tables did not exist yet, this
// migration threw, and the boot failed before the sync could create them. The
// same backfill now runs from bootstrap, after the sync - see
// src/utils/location-relations-backfill.js. The file is kept so environments
// that already ran it keep a consistent migration history.

async function up() {}

async function down() {}

module.exports = { up, down };
