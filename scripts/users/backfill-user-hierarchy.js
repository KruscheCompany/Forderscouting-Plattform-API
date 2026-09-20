#!/usr/bin/env node
/**
 * Backfill the admin-hierarchy levels of existing user-details.
 *
 * Before the admin-hierarchy data-model change a user kept exactly one level
 * (location, municipality or landkreis) and the others were cleared. Now every
 * level an admin picks is kept, because a landkreis or municipality can belong
 * to several parents and the stored choice says which one applies. This script
 * fills the missing parent levels of existing users, but only where the answer
 * is unambiguous:
 *
 *   location     -> municipality  (a location belongs to one municipality)
 *   municipality -> landkreis     (only if it lies in exactly one)
 *   landkreis    -> federal state (only if it lies in exactly one; otherwise
 *                                  the municipality's federal state is tried)
 *
 * It never overwrites a level that is already set and is safe to run twice.
 * Users whose parent level has several candidates are listed in the report -
 * an admin has to pick for them in the user administration.
 *
 * It also reports two data problems the leader rules depend on: leaders with no
 * municipality, and municipalities with more than one leader.
 *
 * Needs the `user_details_federal_state_links` table, which Strapi creates on
 * its first boot after the schema change - boot the backend once before running.
 *
 * Usage:
 *   node scripts/users/backfill-user-hierarchy.js --env=<local|dev|stage|prod> [--apply] [--yes]
 *
 *   (no flag)  dry run: print the plan and the report, write nothing.
 *   --apply    write the fills in one transaction.
 *   --yes      skip the extra "type prod" confirmation for prod.
 */

const { resolveEnvironment, createConnection, confirmProdWrite, query } = require('../lib/db-env')

function parseArgs(argv) {
  const args = { env: null, apply: false, yes: false }
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--env=')) args.env = arg.slice('--env='.length)
    else if (arg === '--apply') args.apply = true
    else if (arg === '--yes') args.yes = true
  }
  return args
}

const groupBy = (rows, keyOf, valueOf) => {
  const map = new Map()
  rows.forEach((row) => {
    const key = keyOf(row)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(valueOf(row))
  })
  return map
}

const valuesOf = (map, key) => map.get(key) || []

async function load(connection) {
  const [
    users, munLinks, lkLinks, fsLinks, locLinks, locMun, munLk, munFs, lkFs, roleRows,
    landkreise, federalStates, municipalities,
  ] = await Promise.all([
    query(connection, `
      SELECT ud.id AS detail_id, u.id AS user_id, u.username
      FROM user_details ud
      LEFT JOIN user_details_user_links ul ON ul.user_detail_id = ud.id
      LEFT JOIN up_users u ON u.id = ul.user_id`),
    query(connection, 'SELECT user_detail_id, municipality_id FROM user_details_municipality_links'),
    query(connection, 'SELECT user_detail_id, landkreis_id FROM user_details_landkreis_links'),
    query(connection, 'SELECT user_detail_id, federal_state_id FROM user_details_federal_state_links'),
    query(connection, 'SELECT user_detail_id, location_id FROM user_details_assigned_location_links'),
    query(connection, 'SELECT location_id, municipality_id FROM locations_municipality_links'),
    query(connection, 'SELECT municipality_id, landkreis_id FROM landkreise_municipalities_links'),
    query(connection, 'SELECT municipality_id, federal_state_id FROM municipalities_federal_states_links'),
    query(connection, 'SELECT landkreis_id, federal_state_id FROM landkreise_federal_states_links'),
    query(connection, `
      SELECT rl.user_id FROM up_users_role_links rl
      JOIN up_roles r ON r.id = rl.role_id WHERE r.type = 'leader'`),
    query(connection, 'SELECT id, title FROM landkreise'),
    query(connection, 'SELECT id, title FROM federal_states'),
    query(connection, 'SELECT id, title FROM municipalities'),
  ])

  const titles = (rows) => new Map(rows.map((r) => [r.id, r.title]))
  return {
    users,
    munOf: new Map(munLinks.map((r) => [r.user_detail_id, r.municipality_id])),
    lkOf: new Map(lkLinks.map((r) => [r.user_detail_id, r.landkreis_id])),
    fsOf: new Map(fsLinks.map((r) => [r.user_detail_id, r.federal_state_id])),
    locOf: new Map(locLinks.map((r) => [r.user_detail_id, r.location_id])),
    munOfLocation: new Map(locMun.map((r) => [r.location_id, r.municipality_id])),
    landkreiseOfMun: groupBy(munLk, (r) => r.municipality_id, (r) => r.landkreis_id),
    fsOfMun: groupBy(munFs, (r) => r.municipality_id, (r) => r.federal_state_id),
    fsOfLk: groupBy(lkFs, (r) => r.landkreis_id, (r) => r.federal_state_id),
    leaderUserIds: new Set(roleRows.map((r) => r.user_id)),
    lkTitle: titles(landkreise),
    fsTitle: titles(federalStates),
    munTitle: titles(municipalities),
  }
}

function plan(data) {
  const fills = { municipality: [], landkreis: [], federalState: [] }
  const ambiguous = []
  const noLevel = []

  data.users.forEach(({ detail_id: id, username }) => {
    let mun = data.munOf.get(id) ?? null
    let lk = data.lkOf.get(id) ?? null
    let fs = data.fsOf.get(id) ?? null
    const loc = data.locOf.get(id) ?? null

    if (!mun && !lk && !fs && !loc) {
      noLevel.push({ id, username })
      return
    }

    if (!mun && loc && data.munOfLocation.get(loc)) {
      mun = data.munOfLocation.get(loc)
      fills.municipality.push({ id, value: mun })
    }

    if (!lk && mun) {
      const candidates = valuesOf(data.landkreiseOfMun, mun)
      if (candidates.length === 1) {
        lk = candidates[0]
        fills.landkreis.push({ id, value: lk })
      } else if (candidates.length > 1) {
        ambiguous.push({
          id, username, level: 'landkreis', municipality: data.munTitle.get(mun),
          candidates: candidates.map((c) => data.lkTitle.get(c)),
        })
      }
    }

    if (!fs) {
      const viaLandkreis = lk ? valuesOf(data.fsOfLk, lk) : []
      const candidates = viaLandkreis.length > 0 ? viaLandkreis : mun ? valuesOf(data.fsOfMun, mun) : []
      if (candidates.length === 1) {
        fs = candidates[0]
        fills.federalState.push({ id, value: fs })
      } else if (candidates.length > 1) {
        ambiguous.push({
          id, username, level: 'federalState',
          landkreis: lk ? data.lkTitle.get(lk) : null,
          municipality: mun ? data.munTitle.get(mun) : null,
          candidates: candidates.map((c) => data.fsTitle.get(c)),
        })
      }
    }
  })

  const leaders = data.users.filter((u) => data.leaderUserIds.has(u.user_id))
  const leadersWithoutMunicipality = leaders.filter((u) => {
    const stillNone = !data.munOf.get(u.detail_id) && !fills.municipality.some((f) => f.id === u.detail_id)
    return stillNone
  })
  const leadersByMunicipality = groupBy(
    leaders.filter((u) => data.munOf.get(u.detail_id)),
    (u) => data.munOf.get(u.detail_id),
    (u) => u.username
  )
  const duplicateLeaders = [...leadersByMunicipality.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([munId, names]) => ({ municipality: data.munTitle.get(munId), leaders: names }))

  return { fills, ambiguous, noLevel, leadersWithoutMunicipality, duplicateLeaders }
}

function printReport(result, apply) {
  const { fills, ambiguous, noLevel, leadersWithoutMunicipality, duplicateLeaders } = result
  console.log(apply ? '\nApplying:' : '\nDry run - would fill:')
  console.log(`  municipality from location : ${fills.municipality.length}`)
  console.log(`  landkreis from municipality: ${fills.landkreis.length}`)
  console.log(`  federal state              : ${fills.federalState.length}`)

  console.log(`\nAmbiguous - an admin must pick these in the user administration (${ambiguous.length}):`)
  ambiguous.forEach((a) => {
    const where = [a.municipality && `municipality ${a.municipality}`, a.landkreis && `landkreis ${a.landkreis}`]
      .filter(Boolean).join(', ')
    console.log(`  - ${a.username || `detail #${a.id}`}: ${a.level} unclear (${where}) -> ${a.candidates.join(' | ')}`)
  })

  console.log(`\nUsers with no level assigned at all (${noLevel.length}):`)
  noLevel.forEach((u) => console.log(`  - ${u.username || `detail #${u.id}`}`))

  console.log(`\nLeaders without a municipality (${leadersWithoutMunicipality.length}) - saving them will be rejected until fixed:`)
  leadersWithoutMunicipality.forEach((u) => console.log(`  - ${u.username}`))

  console.log(`\nMunicipalities with more than one leader (${duplicateLeaders.length}):`)
  duplicateLeaders.forEach((d) => console.log(`  - ${d.municipality}: ${d.leaders.join(', ')}`))
}

async function nextOrders(connection, table, targetColumn) {
  const rows = await query(connection, `SELECT ${targetColumn} AS target, MAX(user_detail_order) AS max FROM ${table} GROUP BY ${targetColumn}`)
  return new Map(rows.map((r) => [r.target, r.max || 0]))
}

async function insertFills(connection, table, targetColumn, fills) {
  if (fills.length === 0) return
  const orders = await nextOrders(connection, table, targetColumn)
  for (const { id, value } of fills) {
    const order = (orders.get(value) || 0) + 1
    orders.set(value, order)
    await query(
      connection,
      `INSERT INTO ${table} (user_detail_id, ${targetColumn}, user_detail_order) VALUES (?, ?, ?)`,
      [id, value, order]
    )
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const env = resolveEnvironment(args.env)
  const connection = createConnection(env)

  try {
    const hasTable = await query(connection, "SHOW TABLES LIKE 'user_details_federal_state_links'")
    if (hasTable.length === 0) {
      console.error('user_details_federal_state_links does not exist yet - boot the backend once so Strapi syncs the new schema, then run this again.')
      process.exit(1)
    }

    console.log(`Environment: ${env.label}`)
    const result = plan(await load(connection))
    printReport(result, args.apply)

    if (!args.apply) {
      console.log('\nNothing written. Re-run with --apply to write the fills above.')
      return
    }
    if (env.label === 'prod') await confirmProdWrite(args.yes)

    await query(connection, 'START TRANSACTION')
    try {
      await insertFills(connection, 'user_details_municipality_links', 'municipality_id', result.fills.municipality)
      await insertFills(connection, 'user_details_landkreis_links', 'landkreis_id', result.fills.landkreis)
      await insertFills(connection, 'user_details_federal_state_links', 'federal_state_id', result.fills.federalState)
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
