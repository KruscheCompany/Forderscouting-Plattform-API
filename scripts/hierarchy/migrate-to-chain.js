#!/usr/bin/env node
/**
 * Move the admin hierarchy to a pure chain: location -> municipality ->
 * landkreis -> federal state.
 *
 * Before this change municipalities and locations also stored shortcut links
 * to a federal state / landkreis, and users stored every level. Now only the
 * chain is stored and everything else is derived, so this script:
 *
 *   1. deletes a shortcut link (municipality->state, location->state,
 *      location->landkreis) only if its target is already reachable through the
 *      chain; otherwise it stays and is reported.
 *   2. clears user_detail.federalState on everyone and user_detail.landkreis
 *      on users that also have a municipality.
 *   3. reports municipalities with no federal state via the chain, non-guest
 *      users without municipality/landkreis, guests without a location and
 *      non-guest Orte outside their anchor's scope (kept as they are).
 *
 * Run it before the schema fields are removed. The schema-removal gate is an
 * empty report.
 *
 * Usage:
 *   node scripts/hierarchy/migrate-to-chain.js --env=<local|dev|stage|prod> [--apply] [--yes]
 *
 *   (no flag)  dry run: print the plan and the report, write nothing.
 *   --apply    write the plan in one transaction.
 *   --yes      skip the extra "type prod" confirmation for prod.
 */

const { resolveEnvironment, createConnection, confirmProdWrite, query } = require('../lib/db-env')
const { planMigration } = require('./plan')

const USER_LEVEL_TABLES = {
  federalState: 'user_details_federal_state_links',
  landkreis: 'user_details_landkreis_links',
}

function parseArgs(argv) {
  const args = { env: null, apply: false, yes: false }
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--env=')) args.env = arg.slice('--env='.length)
    else if (arg === '--apply') args.apply = true
    else if (arg === '--yes') args.yes = true
  }
  return args
}

const firstBy = (rows, keyOf, valueOf) => {
  const map = new Map()
  rows.forEach((row) => {
    if (!map.has(keyOf(row))) map.set(keyOf(row), valueOf(row))
  })
  return map
}

async function tableExists(connection, table) {
  return (await query(connection, 'SHOW TABLES LIKE ?', [table])).length > 0
}

async function loadSnapshot(connection, hasUserFederalState) {
  const [
    landkreisFederalStates, landkreisMunicipalities, locationMunicipalities,
    municipalityFederalStates, locationFederalStates, locationLandkreise,
    municipalities, details, munLinks, lkLinks, fsLinks, locLinks,
  ] = await Promise.all([
    query(connection, 'SELECT id, landkreis_id, federal_state_id FROM landkreise_federal_states_links'),
    query(connection, 'SELECT id, landkreis_id, municipality_id FROM landkreise_municipalities_links'),
    query(connection, 'SELECT id, location_id, municipality_id FROM locations_municipality_links'),
    query(connection, 'SELECT id, municipality_id, federal_state_id FROM municipalities_federal_states_links'),
    query(connection, 'SELECT id, location_id, federal_state_id FROM locations_federal_states_links'),
    query(connection, 'SELECT id, location_id, landkreis_id FROM locations_landkreise_links'),
    query(connection, 'SELECT id, title FROM municipalities'),
    query(connection, `
      SELECT ud.id, u.username, r.type AS role_type
      FROM user_details ud
      LEFT JOIN user_details_user_links ul ON ul.user_detail_id = ud.id
      LEFT JOIN up_users u ON u.id = ul.user_id
      LEFT JOIN up_users_role_links rl ON rl.user_id = u.id
      LEFT JOIN up_roles r ON r.id = rl.role_id`),
    query(connection, 'SELECT user_detail_id, municipality_id FROM user_details_municipality_links'),
    query(connection, 'SELECT user_detail_id, landkreis_id FROM user_details_landkreis_links'),
    hasUserFederalState
      ? query(connection, 'SELECT user_detail_id, federal_state_id FROM user_details_federal_state_links')
      : [],
    query(connection, 'SELECT user_detail_id, location_id FROM user_details_assigned_location_links'),
  ])

  const munOf = firstBy(munLinks, (r) => r.user_detail_id, (r) => r.municipality_id)
  const lkOf = firstBy(lkLinks, (r) => r.user_detail_id, (r) => r.landkreis_id)
  const fsOf = firstBy(fsLinks, (r) => r.user_detail_id, (r) => r.federal_state_id)
  const locOf = firstBy(locLinks, (r) => r.user_detail_id, (r) => r.location_id)

  return {
    municipalities,
    landkreisFederalStates,
    landkreisMunicipalities,
    locationMunicipalities,
    municipalityFederalStates,
    locationFederalStates,
    locationLandkreise,
    userDetails: details.map((d) => ({
      id: d.id,
      username: d.username,
      roleType: d.role_type,
      municipality: munOf.get(d.id) ?? null,
      landkreis: lkOf.get(d.id) ?? null,
      federalState: fsOf.get(d.id) ?? null,
      assignedLocation: locOf.get(d.id) ?? null,
    })),
  }
}

const label = (id, title) => (title ? `${title} (#${id})` : `#${id}`)

function printReport({ deleteLinks, userUpdates, report }, apply) {
  console.log(apply ? '\nApplying:' : '\nDry run - would change:')
  const byTable = deleteLinks.reduce((acc, { table }) => ({ ...acc, [table]: (acc[table] || 0) + 1 }), {})
  Object.entries(byTable).forEach(([table, count]) => console.log(`  delete ${count} from ${table}`))
  if (deleteLinks.length === 0) console.log('  no shortcut links to delete')
  const clears = (level) => userUpdates.filter((u) => u.clear.includes(level)).length
  console.log(`  clear user federalState: ${clears('federalState')}`)
  console.log(`  clear user landkreis   : ${clears('landkreis')}`)

  const section = (title, rows, line) => {
    console.log(`\n${title} (${rows.length}):`)
    rows.forEach((row) => console.log(`  - ${line(row)}`))
  }
  const user = (u) => `${u.username || `detail #${u.userDetailId}`} [${u.roleType}]`

  section('Shortcut links not reachable via the chain - kept, an admin must link a Landkreis',
    report.unreachableShortcuts,
    (s) => `${s.table} #${s.id}: ${s.municipality ? `municipality ${label(s.municipality.id, s.municipality.title)}` : `location #${s.location}`} -> #${s.target}, chain gives [${s.chain.join(', ')}]`)
  section('Municipalities without a federal state via the chain', report.municipalitiesWithoutState, (m) => label(m.id, m.title))
  section('Non-guest users without municipality or landkreis', report.usersWithoutAnchor, user)
  section('Guests without a location', report.guestsWithoutLocation, user)
  section('Non-guest Ort outside the anchor scope (kept)', report.ortOutsideScope, (u) => `${user(u)}: location #${u.location}`)
}

async function applyPlan(connection, { deleteLinks, userUpdates }) {
  for (const { table, id } of deleteLinks) {
    await query(connection, `DELETE FROM ${table} WHERE id = ?`, [id])
  }
  for (const [level, table] of Object.entries(USER_LEVEL_TABLES)) {
    const ids = userUpdates.filter((u) => u.clear.includes(level)).map((u) => u.userDetailId)
    if (ids.length > 0) await query(connection, `DELETE FROM ${table} WHERE user_detail_id IN (?)`, [ids])
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const env = resolveEnvironment(args.env)
  const connection = createConnection(env)

  try {
    console.log(`Environment: ${env.label}`)
    const hasUserFederalState = await tableExists(connection, USER_LEVEL_TABLES.federalState)
    const result = planMigration(await loadSnapshot(connection, hasUserFederalState))
    printReport(result, args.apply)

    if (!args.apply) {
      console.log('\nNothing written. Re-run with --apply to write the changes above.')
      return
    }
    if (env.label === 'prod') await confirmProdWrite(args.yes)

    await query(connection, 'START TRANSACTION')
    try {
      await applyPlan(connection, result)
      await query(connection, 'COMMIT')
      console.log('\nDone.')
    } catch (error) {
      await query(connection, 'ROLLBACK')
      throw error
    }
  } finally {
    connection.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
