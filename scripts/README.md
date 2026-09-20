# scripts/

One-off and recurring maintenance tools for this Strapi app. Run everything
from the repo root (`node scripts/...`), with `.env` populated.

## translations/ — translation sync

- **`sync.js`** — the tool you actually run. Connects directly to an
  environment's MySQL DB (no Strapi HTTP API, no SSH). Reads/writes this
  repo's `de.json`/`en.json` at the repo root.

  ```
  node scripts/translations/sync.js
  npm run translations:sync
  ```

  Run with no flags — it prompts interactively: pick the environment, shows
  the dry-run plan, then asks whether to apply. Flags skip the prompts:

  ```
  node scripts/translations/sync.js --env=<local|dev|stage|prod> [--apply] [--yes]
  node scripts/translations/sync.js --env=prod --bootstrap [--apply]
  ```

  - No `--apply` → dry-run only, prints the plan, writes nothing (unless you
    confirm "apply this plan?" at the prompt).
  - `--apply` → skips the apply prompt and executes it.
  - `--yes` → prod only, skips the "type prod to confirm" prompt.
  - `--bootstrap` → prod only, one-time. Needed once before the first normal
    prod sync (if the snapshot is missing, the tool prompts to bootstrap
    instead of erroring). Seeds `snapshot.prod.json` from prod's actual
    current values for every key that already exists in both places, and
    pushes any keys that only exist locally. It does **not** touch local
    files.

  Behavior differs by environment:
  - **local / dev / stage**: plain mirror-push. Every key in `de.json`/
    `en.json` is inserted or updated into that DB to match. No conflict
    logic — these environments always mirror local files.
  - **prod**: 3-way merge against `snapshot.prod.json` (each key's
    last-known value + prod's `updated_at`). If prod changed since last
    sync (an admin edited it in Strapi), that value is pulled back into
    `de.json`/`en.json` automatically (and into the FE repo's
    `src/i18n/*` files too, if that repo is checked out alongside this
    one). If only your local file changed, it's pushed to prod. If **both**
    changed since last sync, prod always wins — pulled into local, and the
    run prints a conflict report (key, your discarded value, prod's
    winning value) so you can see it and manually re-push your edit later
    if it should have stuck. Nothing ever blocks waiting for input.

- **`schema-introspect.js`** — read-only. Prints the real `translations`
  table structure (`SHOW CREATE TABLE`, `DESCRIBE`, row count, sample rows).
  Strapi's i18n plugin injects columns not visible in
  `src/api/translation/content-types/translation/schema.json`, so this is
  how to check what's actually there.

  ```
  node scripts/translations/schema-introspect.js --env=<local|dev|stage|prod>
  ```

- **`snapshot.prod.json`** — tracked in git. Bookkeeping for the prod 3-way
  merge: one entry per `key|locale` with the last value known to be in prod
  and prod's `updated_at` at that time. Only prod needs this — local/dev/
  stage always just mirror local files, so there's nothing to track for
  them. Don't hand-edit this unless you know exactly what you're doing; a
  wrong entry can misclassify a key on the next sync.

**Adding/editing a translation key:** edit `src/i18n/de/index.json` /
`src/i18n/en-us/index.json` in the FE repo first (source of truth for what
the FE expects), copy into this repo's `de.json`/`en.json`, then run
`sync.js` for whichever environment(s) you want it in.

## lib/ — shared helpers (not run directly)

- **`db-env.js`** — per-environment MySQL connection config
  (`DATABASE_*_<ENV>` vars), used by `translations/*.js`. `local` falls
  back to the generic `DATABASE_*` vars Strapi itself uses if the
  `_LOCAL`-suffixed ones aren't set.
- **`http-env.js`** — per-environment Strapi API URL + JWT login
  (`STRAPI_API_URL_<ENV>` / `TRANSLATE_EMAIL_AUTH_<ENV>` /
  `TRANSLATE_EMAIL_PASS_<ENV>` vars), used by `locations/*.js`. Includes the
  interactive environment picker and the "type prod to confirm" prompt.
- **`flatten.js`** — dot-notation flatten/unflatten for nested translation
  JSON (`{a: {b: "c"}}` ↔ `{"a.b": "c"}`).
- **`translations-repo.js`** — reads/writes `de.json`/`en.json`, the FE
  repo's i18n files, and `snapshot.prod.json`.

## locations/ — reference-data seeders (HTTP + JWT, unchanged from before)

- **`import-locations.js`** — creates `location` entries under existing
  municipalities from a hardcoded map. Prompts for target environment.

  ```
  node scripts/locations/import-locations.js
  ```

- **`seed-dummy-hierarchy.js`** — seeds fictional federal-state / landkreis
  / municipality rows into **local only** (never prompts for env), for
  exercising the funding-edit cascading selects in the frontend.

  ```
  node scripts/locations/seed-dummy-hierarchy.js
  ```

## maintenance/ — one-off diagnostics

- **`inventory-location-backfill.js`** — read-only. Cross-checks free-text
  location values on user-details, guest-requests, and project.info against
  the real `location` catalogue, classifying each as an exact match, a
  cross-municipality match (needs a human look), or unmatched/orphaned data.
  Makes no writes. Safe to run against any environment with `DATABASE_*`
  vars set.

  ```
  node scripts/maintenance/inventory-location-backfill.js [--json out.json]
  ```

## users/ — one-off data backfills

- **`backfill-user-hierarchy.js`** — fills the missing parent levels
  (municipality, landkreis, federal state) of existing users where there is
  exactly one candidate, and reports the ambiguous ones, users with no level,
  leaders without a municipality and municipalities with more than one leader.
  Dry run by default; `--apply` writes (prod asks for confirmation). Needs the
  `user_details_federal_state_links` table, so boot Strapi once after the
  schema change first.

  ```bash
  node scripts/users/backfill-user-hierarchy.js --env=local            # dry run
  node scripts/users/backfill-user-hierarchy.js --env=prod --apply
  ```
