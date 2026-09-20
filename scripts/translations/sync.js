/**
 * Unified translation sync tool — replaces import_translations.js,
 * export_translations.js, and update_translation_value.js. Talks to each
 * environment's MySQL DB directly (see scripts/lib/db-env.js), no more
 * HTTP+JWT, no more SSH-ing onto a server to run this.
 *
 * local/dev/stage: mirror-push. Every key in the BE's local de.json/en.json
 * is inserted or updated into that environment's DB. No conflict logic —
 * these environments always mirror local files exactly.
 *
 * prod: 3-way merge against scripts/translations/snapshot.prod.json (each
 * key/locale's last-known value + prod's `updated_at` at that time). Edits
 * made directly in Strapi admin on prod are pulled back into local files
 * (and the FE repo's i18n files, if checked out alongside) automatically;
 * local edits are pushed to prod; if both changed since last sync, prod
 * always wins and the run prints a conflict report — nothing ever blocks
 * waiting for manual input.
 *
 * Usage:
 *   node scripts/translations/sync.js --env=<local|dev|stage|prod> [--apply] [--yes]
 *   node scripts/translations/sync.js --env=prod --bootstrap [--apply]
 *
 *   (no --apply)  dry-run: prints the full plan, writes nothing.
 *   --apply       executes the plan (DB writes, local/FE file writes, snapshot write).
 *   --yes         prod only: skip the interactive "type prod to confirm" prompt.
 *   --bootstrap   prod only, one-time: seed snapshot.prod.json from CURRENT
 *                 local file values for every key that already exists in
 *                 both local and prod (does not pull prod's values over
 *                 local's — see CLAUDE.md / the sync design notes for why).
 *                 Required once before the first normal prod run; refuses
 *                 to run normally against prod with an empty snapshot.
 */

const { resolveEnvironment, createConnection, confirmProdWrite, query } = require('../lib/db-env')
const { loadLocalFlat, writeLocalFlat, loadSnapshot, writeSnapshot } = require('../lib/translations-repo')

const LOCALES = ['de', 'en']

function parseArgs(argv) {
  const args = { apply: false, yes: false, bootstrap: false }
  for (const arg of argv.slice(2)) {
    if (arg === '--apply') args.apply = true
    else if (arg === '--yes') args.yes = true
    else if (arg === '--bootstrap') args.bootstrap = true
    else {
      const match = arg.match(/^--([^=]+)=(.*)$/)
      if (match) args[match[1]] = match[2]
    }
  }
  return args
}

function idKey(key, locale) {
  return `${key}|${locale}`
}

function splitIdKey(id) {
  const sep = id.lastIndexOf('|')
  return [id.slice(0, sep), id.slice(sep + 1)]
}

function toIso(mysqlDate) {
  return mysqlDate instanceof Date ? mysqlDate.toISOString() : mysqlDate
}

async function fetchLive(connection) {
  const rows = await query(connection, 'SELECT id, `key`, locale, value, updated_at FROM translations WHERE locale IN (?)', [LOCALES])
  const byIdKey = new Map()
  for (const row of rows) {
    const id = idKey(row.key, row.locale)
    if (!byIdKey.has(id)) byIdKey.set(id, [])
    byIdKey.get(id).push(row)
  }
  const duplicates = []
  for (const [id, group] of byIdKey) {
    group.sort((a, b) => a.id - b.id)
    if (group.length > 1) duplicates.push({ id, rows: group })
  }
  return { byIdKey, duplicates }
}

// ---------- local/dev/stage: mirror-push ----------

function planMirrorPush(localFlat, live) {
  const toInsert = []
  const toUpdate = []
  let unchangedCount = 0

  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(localFlat[locale] || {})) {
      const id = idKey(key, locale)
      const group = live.byIdKey.get(id)
      if (!group) {
        toInsert.push({ key, locale, value })
      } else if (group[0].value !== value) {
        toUpdate.push({ key, locale, value, id: group[0].id })
      } else {
        unchangedCount++
      }
    }
  }

  return { toInsert, toUpdate, unchangedCount }
}

async function applyMirrorPush(connection, plan) {
  await beginTransaction(connection)
  try {
    for (const { key, locale, value } of plan.toInsert) {
      await query(connection, 'INSERT INTO translations (`key`, value, locale, created_at, updated_at) VALUES (?, ?, ?, NOW(6), NOW(6))', [key, value, locale])
    }
    for (const { value, id } of plan.toUpdate) {
      await query(connection, 'UPDATE translations SET value = ?, updated_at = NOW(6) WHERE id = ?', [value, id])
    }
    await commit(connection)
  } catch (error) {
    await rollback(connection)
    throw error
  }
}

// ---------- prod: 3-way merge ----------

function planProdMerge(localFlat, snapshot, live, { bootstrap } = {}) {
  const pushToProd = []
  const pullFromProd = []
  const conflicts = []
  const seeded = []
  let unchangedCount = 0
  const carryForwardEntries = { ...snapshot.entries }

  const allIds = new Set([
    ...Object.keys(snapshot.entries),
    ...LOCALES.flatMap((locale) => Object.keys(localFlat[locale] || {}).map((key) => idKey(key, locale))),
    ...live.byIdKey.keys()
  ])

  for (const id of allIds) {
    const [key, locale] = splitIdKey(id)
    const snapEntry = snapshot.entries[id]
    const liveGroup = live.byIdKey.get(id)
    const liveRow = liveGroup ? liveGroup[0] : undefined
    const hasLocal = Object.prototype.hasOwnProperty.call(localFlat[locale] || {}, key)
    const localVal = hasLocal ? localFlat[locale][key] : undefined
    const hasSnap = !!snapEntry
    const hasProd = !!liveRow

    if (!hasSnap) {
      if (hasLocal && hasProd) {
        if (bootstrap) {
          // Snapshot bookkeeping always records prod's TRUE value (that's
          // what "last known prod value" means for diffing) — bootstrap only
          // means "don't overwrite local FILES with it". If local already
          // differed from prod at seed time, that's now correctly visible as
          // localChanged on the very next run, so it gets pushed like any
          // other pending local edit.
          carryForwardEntries[id] = { value: liveRow.value, prodUpdatedAt: toIso(liveRow.updated_at) }
          seeded.push({ key, locale })
        } else {
          // No baseline to compare against yet outside of a bootstrap run —
          // default to "prod wins" rather than guessing.
          pullFromProd.push({ key, locale, value: liveRow.value, reason: 'no-snapshot-baseline' })
        }
      } else if (hasLocal && !hasProd) {
        pushToProd.push({ key, locale, value: localVal, id: null, reason: 'new-key-local' })
      } else if (!hasLocal && hasProd) {
        pullFromProd.push({ key, locale, value: liveRow.value, reason: 'new-key-prod' })
      }
      continue
    }

    if (!hasProd) {
      // Existed before, no longer in prod (deleted directly in admin).
      // Delete propagation is out of scope for v1 — leave local as-is, drop from snapshot.
      delete carryForwardEntries[id]
      continue
    }

    // Timestamp is the sole signal for "did prod change since last sync" —
    // NOT a value comparison. A value that already differed from the
    // snapshot's recorded value at bootstrap time (pre-existing drift from
    // before tracking started) must NOT be treated as a fresh prod edit,
    // or it would pull prod's stale value over a newer local one.
    const prodChanged = toIso(liveRow.updated_at) !== snapEntry.prodUpdatedAt
    const localChanged = hasLocal ? localVal !== snapEntry.value : false

    if (!prodChanged && !localChanged) {
      unchangedCount++
    } else if (prodChanged && !localChanged) {
      pullFromProd.push({ key, locale, value: liveRow.value, reason: 'prod-changed' })
    } else if (localChanged && !prodChanged) {
      pushToProd.push({ key, locale, value: localVal, id: liveRow.id, reason: 'local-changed' })
    } else {
      pullFromProd.push({ key, locale, value: liveRow.value, reason: 'double-conflict' })
      conflicts.push({ key, locale, discardedLocalValue: localVal, wonProdValue: liveRow.value })
    }
  }

  return { pushToProd, pullFromProd, conflicts, seeded, unchangedCount, carryForwardEntries }
}

async function applyProdMerge(connection, plan, live) {
  const newEntries = { ...plan.carryForwardEntries }

  await beginTransaction(connection)
  try {
    for (const item of plan.pushToProd) {
      if (item.id) {
        await query(connection, 'UPDATE translations SET value = ?, updated_at = NOW(6) WHERE id = ?', [item.value, item.id])
        const [row] = await query(connection, 'SELECT updated_at FROM translations WHERE id = ?', [item.id])
        newEntries[idKey(item.key, item.locale)] = { value: item.value, prodUpdatedAt: toIso(row.updated_at) }
      } else {
        const result = await query(connection, 'INSERT INTO translations (`key`, value, locale, created_at, updated_at) VALUES (?, ?, ?, NOW(6), NOW(6))', [item.key, item.value, item.locale])
        const [row] = await query(connection, 'SELECT updated_at FROM translations WHERE id = ?', [result.insertId])
        newEntries[idKey(item.key, item.locale)] = { value: item.value, prodUpdatedAt: toIso(row.updated_at) }
      }
    }
    await commit(connection)
  } catch (error) {
    await rollback(connection)
    throw error
  }

  for (const item of plan.pullFromProd) {
    const group = live.byIdKey.get(idKey(item.key, item.locale))
    newEntries[idKey(item.key, item.locale)] = { value: item.value, prodUpdatedAt: toIso(group[0].updated_at) }
  }

  return newEntries
}

// ---------- transaction helpers ----------

function beginTransaction(connection) {
  return new Promise((resolve, reject) => connection.beginTransaction((err) => (err ? reject(err) : resolve())))
}
function commit(connection) {
  return new Promise((resolve, reject) => connection.commit((err) => (err ? reject(err) : resolve())))
}
function rollback(connection) {
  return new Promise((resolve) => connection.rollback(() => resolve()))
}

// ---------- output ----------

function printMirrorPlan(env, plan, applied) {
  const tag = applied ? '' : '[DRY RUN] '
  console.log(`\n${tag}Mirror-push plan for ${env.label}:`)
  console.log(`  insert: ${plan.toInsert.length}`)
  console.log(`  update: ${plan.toUpdate.length}`)
  console.log(`  unchanged: ${plan.unchangedCount}`)
  if (plan.toInsert.length) console.log('  -- to insert --\n' + plan.toInsert.map((i) => `     ${i.locale} ${i.key}`).join('\n'))
  if (plan.toUpdate.length) console.log('  -- to update --\n' + plan.toUpdate.map((i) => `     ${i.locale} ${i.key}`).join('\n'))
}

function printProdPlan(plan, applied, bootstrap) {
  const tag = applied ? '' : '[DRY RUN] '
  console.log(`\n${tag}${bootstrap ? 'Bootstrap' : 'Prod 3-way merge'} plan:`)
  if (bootstrap) console.log(`  seeded (no db write): ${plan.seeded.length}`)
  console.log(`  push to prod: ${plan.pushToProd.length}`)
  console.log(`  pull from prod: ${plan.pullFromProd.length}`)
  console.log(`  conflicts (prod wins): ${plan.conflicts.length}`)
  console.log(`  unchanged: ${plan.unchangedCount}`)
  if (plan.pushToProd.length) console.log('  -- pushed to prod --\n' + plan.pushToProd.map((i) => `     ${i.locale} ${i.key} (${i.reason})`).join('\n'))
  if (plan.pullFromProd.length) console.log('  -- pulled from prod --\n' + plan.pullFromProd.map((i) => `     ${i.locale} ${i.key} (${i.reason})`).join('\n'))
  if (plan.conflicts.length) {
    console.log('  -- CONFLICTS: prod overrode your local edit --')
    plan.conflicts.forEach((c) => console.log(`     ${c.locale} ${c.key}\n       local (discarded): ${JSON.stringify(c.discardedLocalValue)}\n       prod (won):        ${JSON.stringify(c.wonProdValue)}`))
  }
}

function printDuplicateWarning(duplicates) {
  if (!duplicates.length) return
  console.log('\n⚠️  Found duplicate key+locale rows already in the DB (pre-existing data issue, not caused by this tool). Only the lowest id is used for comparisons/updates:')
  duplicates.forEach((d) => console.log(`     ${d.id} -> ids ${d.rows.map((r) => r.id).join(', ')}`))
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv)
  if (!args.env) {
    console.error('Usage: node scripts/translations/sync.js --env=<local|dev|stage|prod> [--apply] [--yes] [--bootstrap]')
    process.exit(1)
  }

  const env = resolveEnvironment(args.env)
  const localFlat = loadLocalFlat()
  const connection = createConnection(env)

  try {
    const live = await fetchLive(connection)
    printDuplicateWarning(live.duplicates)

    if (env.label === 'prod') {
      const snapshot = loadSnapshot()

      if (!args.bootstrap && Object.keys(snapshot.entries).length === 0) {
        console.error('❌ scripts/translations/snapshot.prod.json is empty/missing. Run with --bootstrap first:\n   node scripts/translations/sync.js --env=prod --bootstrap --apply')
        process.exit(1)
      }

      const plan = planProdMerge(localFlat, snapshot, live, { bootstrap: args.bootstrap })
      printProdPlan(plan, args.apply, args.bootstrap)

      if (!args.apply) return

      if (!args.bootstrap) await confirmProdWrite(args.yes)

      const newEntries = await applyProdMerge(connection, plan, live)

      let feWritten = []
      if (plan.pullFromProd.length > 0) {
        for (const item of plan.pullFromProd) {
          localFlat[item.locale] = localFlat[item.locale] || {}
          localFlat[item.locale][item.key] = item.value
        }
        // Only rewrite local files when something was actually pulled — a
        // push-only run's local files are already correct (they were the
        // source of the push) and rewriting them anyway just reorders keys
        // via the flatten/unflatten round-trip, creating pure diff noise.
        ;({ feWritten } = writeLocalFlat(localFlat, { alsoWriteFe: true }))
      }
      writeSnapshot(newEntries)

      console.log(`\n✅ Applied. Pushed ${plan.pushToProd.length}, pulled ${plan.pullFromProd.length}, seeded ${plan.seeded.length}.`)
      if (feWritten.length) console.log(`   Also updated FE i18n files: ${feWritten.join(', ')}`)
      else if (plan.pullFromProd.length) console.log('   FE repo not found alongside this one — skipped FE i18n update.')
    } else {
      const plan = planMirrorPush(localFlat, live)
      printMirrorPlan(env, plan, args.apply)

      if (!args.apply) return

      await applyMirrorPush(connection, plan)
      console.log(`\n✅ Applied to ${env.label}.`)
    }
  } finally {
    connection.end()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Sync failed:', error.message)
    process.exit(1)
  })
}

module.exports = { planMirrorPush, planProdMerge, applyMirrorPush, applyProdMerge, idKey }
