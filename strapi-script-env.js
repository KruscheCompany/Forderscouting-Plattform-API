/**
 * Shared environment/auth helpers for the root-level Strapi maintenance
 * scripts (import_translations2.js, update_translation_value.js,
 * import_locations_script2.js).
 *
 * Domains and credentials are read from .env — nothing environment-specific
 * is hardcoded here. Required per environment you use:
 *   STRAPI_API_URL_<ENV>
 *   TRANSLATE_EMAIL_AUTH_<ENV>
 *   TRANSLATE_EMAIL_PASS_<ENV>
 * where <ENV> is LOCAL, DEV, STAGE, or PROD.
 */

require('dotenv').config()
const axios = require('axios')
const readline = require('readline')

const ENVIRONMENTS = {
  local: {
    label: 'local',
    apiUrl: process.env.STRAPI_API_URL_LOCAL,
    emailVar: 'TRANSLATE_EMAIL_AUTH_LOCAL',
    passVar: 'TRANSLATE_EMAIL_PASS_LOCAL'
  },
  dev: {
    label: 'dev',
    apiUrl: process.env.STRAPI_API_URL_DEV,
    emailVar: 'TRANSLATE_EMAIL_AUTH_DEV',
    passVar: 'TRANSLATE_EMAIL_PASS_DEV'
  },
  stage: {
    label: 'stage',
    apiUrl: process.env.STRAPI_API_URL_STAGE,
    emailVar: 'TRANSLATE_EMAIL_AUTH_STAGE',
    passVar: 'TRANSLATE_EMAIL_PASS_STAGE'
  },
  prod: {
    label: 'prod',
    apiUrl: process.env.STRAPI_API_URL_PROD,
    emailVar: 'TRANSLATE_EMAIL_AUTH_PROD',
    passVar: 'TRANSLATE_EMAIL_PASS_PROD'
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, answer => {
    rl.close()
    resolve(answer.trim())
  }))
}

async function selectEnvironment() {
  const keys = Object.keys(ENVIRONMENTS)
  console.log('Select target environment:')
  keys.forEach((key, i) => {
    const env = ENVIRONMENTS[key]
    console.log(`  ${i + 1}) ${key}${env.apiUrl ? ` (${env.apiUrl})` : ' (STRAPI_API_URL_' + key.toUpperCase() + ' not set)'}`)
  })

  const answer = await ask('Enter number or name: ')
  const byIndex = keys[parseInt(answer, 10) - 1]
  const env = ENVIRONMENTS[byIndex] || ENVIRONMENTS[answer.toLowerCase()]

  if (!env) {
    console.error(`❌ Unknown environment: "${answer}"`)
    process.exit(1)
  }

  if (!env.apiUrl) {
    console.error(`❌ Missing STRAPI_API_URL_${env.label.toUpperCase()} in .env`)
    process.exit(1)
  }

  if (env.label === 'prod') {
    const confirm = await ask('⚠️  You selected PROD. Type "prod" again to confirm: ')
    if (confirm.toLowerCase() !== 'prod') {
      console.error('❌ Confirmation did not match. Aborting.')
      process.exit(1)
    }
  }

  return env
}

async function login(env) {
  const identifier = process.env[env.emailVar]
  const password = process.env[env.passVar]

  if (!identifier || !password) {
    console.error(`❌ Missing credentials. Set ${env.emailVar} and ${env.passVar} in .env`)
    process.exit(1)
  }

  try {
    const response = await axios.post(`${env.apiUrl}/api/auth/local`, { identifier, password })
    return response.data.jwt
  } catch (error) {
    console.error(`❌ Login failed for ${env.label} (${identifier}): ${error.message}`)
    if (error.response) {
      console.error(`   Status: ${error.response.status}`)
      console.error(`   Response: ${JSON.stringify(error.response.data, null, 2)}`)
    }
    process.exit(1)
  }
}

module.exports = { ENVIRONMENTS, ask, selectEnvironment, login }
