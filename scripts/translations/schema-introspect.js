/**
 * Read-only schema check for the `translations` table.
 *
 * The `translation` content-type's schema.json only declares `key` and
 * `value` — Strapi's i18n plugin injects additional columns (locale,
 * timestamps, and possibly a localization-link mechanism) that aren't
 * visible there. Run this against every environment before trusting
 * scripts/translations/sync.js's INSERT/UPDATE SQL against it.
 *
 * Usage: node scripts/translations/schema-introspect.js --env=<local|dev|stage|prod>
 */

const { resolveEnvironment, createConnection, query } = require('../lib/db-env')

function parseArgs(argv) {
  const args = {}
  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/)
    if (match) args[match[1]] = match[2] === undefined ? true : match[2]
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.env) {
    console.error('Usage: node scripts/translations/schema-introspect.js --env=<local|dev|stage|prod>')
    process.exit(1)
  }

  const env = resolveEnvironment(args.env)
  const connection = createConnection(env)

  try {
    console.log(`\n=== ${env.label} :: SHOW CREATE TABLE translations ===`)
    const createRows = await query(connection, 'SHOW CREATE TABLE translations')
    console.log(createRows[0]['Create Table'])

    console.log(`\n=== ${env.label} :: DESCRIBE translations ===`)
    const describeRows = await query(connection, 'DESCRIBE translations')
    describeRows.forEach((row) => console.log(`  ${row.Field}\t${row.Type}\t${row.Null}\t${row.Key}\t${row.Default}\t${row.Extra}`))

    console.log(`\n=== ${env.label} :: row count ===`)
    const countRows = await query(connection, 'SELECT COUNT(*) as count FROM translations')
    console.log(`  ${countRows[0].count}`)

    console.log(`\n=== ${env.label} :: sample rows ===`)
    const sampleRows = await query(connection, 'SELECT * FROM translations LIMIT 3')
    console.log(JSON.stringify(sampleRows, null, 2))

    console.log(`\n=== ${env.label} :: tables that look i18n-related ===`)
    const tableRows = await query(connection, "SHOW TABLES LIKE '%translation%'")
    tableRows.forEach((row) => console.log(`  ${Object.values(row)[0]}`))
  } finally {
    connection.end()
  }
}

main().catch((error) => {
  console.error('Schema introspection failed:', error.message)
  process.exit(1)
})
