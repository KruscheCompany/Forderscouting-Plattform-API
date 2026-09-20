/**
 * Per-environment direct-MySQL connection config for scripts/translations/sync.js
 * and scripts/translations/schema-introspect.js.
 *
 * Required per environment (LOCAL, DEV, STAGE, PROD) in .env:
 *   DATABASE_HOST_<ENV>
 *   DATABASE_PORT_<ENV>
 *   DATABASE_USERNAME_<ENV>
 *   DATABASE_PASSWORD_<ENV>
 *   DATABASE_NAME_<ENV>
 *   DATABASE_SSL_<ENV>
 *
 * "local" falls back to the generic DATABASE_* vars Strapi itself uses
 * (config/database.js) if the LOCAL-suffixed ones aren't set, since a
 * checked-out .env already has working local credentials under those names.
 * dev/stage/prod always require their own suffixed vars — the generic
 * DATABASE_* vars represent "whatever env is currently checked out locally"
 * and must never be silently reused for a remote environment.
 */

require('dotenv').config()
// mysql2, not the legacy `mysql` package: dev/stage/prod's managed MySQL 8
// servers use caching_sha2_password by default, which `mysql` v2's pure-JS
// driver can't speak. mysql2 supports the same callback API used here.
const mysql = require('mysql2')
const readline = require('readline')

function buildEnv(label, suffix, { fallbackToGeneric } = {}) {
  const pick = (name) => {
    const suffixed = process.env[`${name}_${suffix}`]
    if (suffixed) return suffixed
    return fallbackToGeneric ? process.env[name] : undefined
  }

  return {
    label,
    host: pick('DATABASE_HOST'),
    port: pick('DATABASE_PORT'),
    user: pick('DATABASE_USERNAME'),
    password: pick('DATABASE_PASSWORD'),
    database: pick('DATABASE_NAME'),
    ssl: pick('DATABASE_SSL')
  }
}

const ENVIRONMENTS = {
  local: buildEnv('local', 'LOCAL', { fallbackToGeneric: true }),
  dev: buildEnv('dev', 'DEV'),
  stage: buildEnv('stage', 'STAGE'),
  prod: buildEnv('prod', 'PROD')
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, answer => {
    rl.close()
    resolve(answer.trim())
  }))
}

function resolveEnvironment(envFlag) {
  const env = ENVIRONMENTS[envFlag]
  if (!env) {
    console.error(`❌ Unknown environment: "${envFlag}". Use one of: ${Object.keys(ENVIRONMENTS).join(', ')}`)
    process.exit(1)
  }

  const required = ['host', 'port', 'user', 'password', 'database']
  const missing = required.filter((key) => !env[key])
  if (missing.length > 0) {
    const suffix = env.label.toUpperCase()
    console.error(`❌ Missing DB config for ${env.label}. Set these in .env: ${missing.map((key) => `DATABASE_${key === 'user' ? 'USERNAME' : key.toUpperCase()}_${suffix}`).join(', ')}`)
    process.exit(1)
  }

  return env
}

async function confirmProdWrite(skipPrompt) {
  if (skipPrompt) return
  const confirm = await ask('⚠️  You are about to WRITE to PROD. Type "prod" again to confirm: ')
  if (confirm.toLowerCase() !== 'prod') {
    console.error('❌ Confirmation did not match. Aborting.')
    process.exit(1)
  }
}

function createConnection(env) {
  return mysql.createConnection({
    host: env.host,
    port: Number(env.port),
    user: env.user,
    password: env.password,
    database: env.database,
    ssl: env.ssl === true || env.ssl === 'true'
  })
}

function query(connection, sql, params) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)))
  })
}

module.exports = { ENVIRONMENTS, ask, resolveEnvironment, confirmProdWrite, createConnection, query }
