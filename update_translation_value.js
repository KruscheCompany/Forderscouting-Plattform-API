/**
 * Strapi Translation Value Updater
 *
 * Usage:
 * 1. Set STRAPI_API_URL_<ENV> and TRANSLATE_EMAIL_AUTH_<ENV> / TRANSLATE_EMAIL_PASS_<ENV>
 *    in .env for the environment you want to update (LOCAL, DEV, STAGE, PROD)
 * 2. Edit the UPDATES array below (or pass your own worklist)
 * 3. Run: node update_translation_value.js
 * 4. Pick the target environment when prompted (prod requires typing "prod"
 *    again to confirm)
 *
 * Requirements:
 * - Node.js with axios package
 */

const axios = require('axios')
const { selectEnvironment, login } = require('./strapi-script-env')

// Translation value updates to push (key/locale/value), matching the style
// of TRANSLATION_FILES in import_translations2.js. Values below must match
// the corresponding entries in src/i18n/de/index.json (FE repo).
const UPDATES = [
  {
    key: 'projectComponents.guidelineContentCheck.title',
    locale: 'de',
    value: 'Richtlinien-Check (Inhalt und Formalitäten) Langfassung'
  },
  {
    key: 'projectComponents.guidelineContentCheck.description',
    locale: 'de',
    value: 'Kurzer Aufgabentext - Bitte vergesst den inhaltlichen und formalen Abgleich mit der Richtlinien-Langfassung nicht. Hier könnt ihr wichtige Passagen mit Seitenzahl dokumentieren'
  },
  {
    key: 'Guideline Check (Content)',
    locale: 'de',
    value: 'Richtlinien-Check (Inhalt und Formalitäten)'
  }
]

/**
 * Finds a translation entry for a given key + locale.
 * @returns {Promise<object|null>} the Strapi entry (with id) or null if not found
 */
async function findTranslation(apiUrl, token, key, locale) {
  const response = await axios.get(apiUrl, {
    headers: { Authorization: token },
    params: { locale, 'filters[key][$eq]': key }
  })

  const entries = response.data && response.data.data ? response.data.data : []
  return entries.length > 0 ? entries[0] : null
}

/**
 * Updates a single translation entry's value via PUT, then re-fetches to confirm.
 */
async function updateTranslationValue(apiUrl, token, { key, locale, value }) {
  const existing = await findTranslation(apiUrl, token, key, locale)

  if (!existing) {
    console.log(`⏭️  Not found - skipping: "${key}" (locale: ${locale})`)
    return { status: 'not-found' }
  }

  const id = existing.id
  const currentValue = existing.attributes ? existing.attributes.value : existing.value

  if (currentValue === value) {
    console.log(`✅ Already up to date: "${key}" (locale: ${locale}) [id ${id}]`)
    return { status: 'unchanged' }
  }

  await axios.put(`${apiUrl}/${id}`, {
    data: { key, value, locale }
  }, {
    headers: { Authorization: token }
  })

  const confirmed = await findTranslation(apiUrl, token, key, locale)
  const confirmedValue = confirmed && (confirmed.attributes ? confirmed.attributes.value : confirmed.value)

  if (confirmedValue === value) {
    console.log(`✅ Updated: "${key}" (locale: ${locale}) [id ${id}]`)
    console.log(`   old: ${JSON.stringify(currentValue)}`)
    console.log(`   new: ${JSON.stringify(confirmedValue)}`)
    return { status: 'updated' }
  }

  console.error(`❌ Update did not confirm for "${key}" (locale: ${locale}) [id ${id}]`)
  console.error(`   expected: ${JSON.stringify(value)}`)
  console.error(`   got:      ${JSON.stringify(confirmedValue)}`)
  return { status: 'failed' }
}

async function run(updates = UPDATES) {
  console.log('🚀 Translation Value Updater')
  console.log('=============================')

  const env = await selectEnvironment()
  console.log(`\n🔐 Logging in to ${env.label} (${env.apiUrl}) as ${process.env[env.emailVar]}...`)
  const jwt = await login(env)
  const apiUrl = `${env.apiUrl}/api/translations`
  const token = `Bearer ${jwt}`
  console.log('✅ Logged in.\n')

  const summary = { updated: 0, unchanged: 0, 'not-found': 0, failed: 0 }

  for (const entry of updates) {
    try {
      const { status } = await updateTranslationValue(apiUrl, token, entry)
      summary[status] = (summary[status] || 0) + 1
    } catch (error) {
      console.error(`❌ Error updating "${entry.key}" (locale: ${entry.locale}): ${error.message}`)
      if (error.response) {
        console.error(`   Status: ${error.response.status}`)
        console.error(`   Response: ${JSON.stringify(error.response.data, null, 2)}`)
      }
      summary.failed += 1
    }
  }

  console.log('\n🎯 Final Summary')
  console.log('================')
  console.log(`Environment:   ${env.label}`)
  console.log(`✅ Updated:     ${summary.updated}`)
  console.log(`⏸️  Unchanged:   ${summary.unchanged}`)
  console.log(`⏭️  Not found:   ${summary['not-found']}`)
  console.log(`❌ Failed:      ${summary.failed}`)
}

if (require.main === module) {
  run().catch(error => {
    console.error('💥 Fatal error during update:', error.message)
    process.exit(1)
  })
}

module.exports = { run, UPDATES }
