/**
 * Strapi Translation Importer
 *
 * This script imports translation files (JSON format) into a Strapi CMS application.
 * It automatically detects existing translations and only imports new ones to avoid duplicates.
 *
 * Features:
 * - Prompts for target environment (local / dev / stage / prod)
 * - Logs in automatically using env-specific credentials to obtain a JWT
 * - Supports multiple locales
 * - Flattens nested JSON structures using dot notation
 * - Progress tracking with visual progress bar
 * - Comprehensive error handling
 * - Professional summary reporting
 *
 * Usage:
 * 1. Set STRAPI_API_URL_<ENV> and TRANSLATE_EMAIL_AUTH_<ENV> / TRANSLATE_EMAIL_PASS_<ENV>
 *    in .env for each environment you want to import to (LOCAL, DEV, STAGE, PROD)
 * 2. Configure the TRANSLATION_FILES array with your translation files
 * 3. Run: node import_translations.js
 * 4. Pick the target environment when prompted (prod requires typing "prod" again to confirm)
 *
 * Requirements:
 * - Node.js with axios package
 * - Translation files in JSON format
 */

const axios = require('axios')
const { selectEnvironment, login } = require('./strapi-script-env')

// Translation files to import
const TRANSLATION_FILES = [
  { file: './en.json', locale: 'en' },
  { file: './de.json', locale: 'de' }
]

/**
 * Simple progress bar implementation
 */
class ProgressBar {
  constructor(total, description = 'Progress') {
    this.total = total
    this.current = 0
    this.description = description
    this.startTime = Date.now()
  }

  update(current = null) {
    if (current !== null) {
      this.current = current
    } else {
      this.current++
    }

    const percentage = Math.round((this.current / this.total) * 100)
    const filled = Math.round((this.current / this.total) * 30)
    const bar = '█'.repeat(filled) + '░'.repeat(30 - filled)

    const elapsed = Date.now() - this.startTime
    const rate = this.current / (elapsed / 1000)
    const eta = this.current === 0 ? 0 : Math.round((this.total - this.current) / rate)

    process.stdout.write(`\r${this.description}: [${bar}] ${percentage}% (${this.current}/${this.total}) ETA: ${eta}s`)
  }

  complete() {
    this.update(this.total)
    console.log('')
  }
}

/**
 * Recursively flattens a nested translation object into dot-notation keys
 * @param {Object} obj - The translation object to flatten
 * @param {string} prefix - The current key prefix
 * @returns {Object} Flattened translation object
 */
function flattenTranslations(obj, prefix = '') {
  const result = {}

  for (const key in obj) {
    const value = obj[key]
    const newKey = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenTranslations(value, newKey))
    } else {
      result[newKey] = value
    }
  }

  return result
}

/**
 * Checks if a translation key already exists for a given locale in Strapi
 * @param {string} apiUrl - The translations API endpoint
 * @param {string} token - The Bearer token
 * @param {string} key - The translation key to check
 * @param {string} locale - The locale to check for
 * @returns {Promise<boolean>} True if the translation exists, false otherwise
 */
async function checkIfTranslationExists(apiUrl, token, key, locale) {
  try {
    // Try multiple API query formats to ensure compatibility
    const queryMethods = [
      // Method 1: Using params object
      () => axios.get(apiUrl, {
        headers: { Authorization: token },
        params: { locale: locale, 'filters[key][$eq]': key }
      }),

      // Method 2: Direct URL with encoding
      () => axios.get(`${apiUrl}?locale=${locale}&filters[key][$eq]=${encodeURIComponent(key)}`, {
        headers: { Authorization: token }
      }),

      // Method 3: Fetch all for locale and filter manually
      async () => {
        const response = await axios.get(`${apiUrl}?locale=${locale}&pagination[pageSize]=1000`, {
          headers: { Authorization: token }
        })

        if (response.data.data) {
          const found = response.data.data.find(item =>
            item.attributes && item.attributes.key === key
          )
          return { data: { data: found ? [found] : [] } }
        }
        return { data: { data: [] } }
      }
    ]

    let lastError
    for (const method of queryMethods) {
      try {
        const response = await method()
        if (response.data.data && response.data.data.length > 0) {
          return true
        }
        return false
      } catch (methodError) {
        lastError = methodError
        continue
      }
    }

    throw lastError
  } catch (error) {
    throw error
  }
}

/**
 * Imports translations for a specific locale, skipping existing ones
 * @param {string} apiUrl - The translations API endpoint
 * @param {string} token - The Bearer token
 * @param {Object} translations - The translation object to import
 * @param {string} locale - The locale to import translations for
 * @returns {Promise<Object>} Import statistics
 */
async function importTranslationsForLocale(apiUrl, token, translations, locale) {
  const flatTranslations = flattenTranslations(translations)
  const translationEntries = Object.entries(flatTranslations)
  const progressBar = new ProgressBar(translationEntries.length, `Processing ${locale}`)

  let importedCount = 0
  let skippedCount = 0

  for (let i = 0; i < translationEntries.length; i++) {
    const [key, value] = translationEntries[i]

    try {
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 50))

      // Check if translation already exists
      const exists = await checkIfTranslationExists(apiUrl, token, key, locale)

      if (exists) {
        skippedCount++
      } else {
        // Import new translation
        await axios.post(apiUrl, {
          data: { key, value, locale }
        }, {
          headers: { Authorization: token }
        })
        importedCount++
      }
    } catch (error) {
      progressBar.complete()
      console.error(`\n❌ API call failed for key "${key}" (locale: ${locale}): ${error.message}`)
      if (error.response) {
        console.error(`   Status: ${error.response.status}`)
        console.error(`   Response: ${JSON.stringify(error.response.data, null, 2)}`)
      }
      process.exit(1)
    }

    progressBar.update(i + 1)
  }

  progressBar.complete()
  return { importedCount, skippedCount }
}

/**
 * Main function to import all translation files
 */
async function importAllTranslations() {
  console.log('🚀 Translation Import Tool')
  console.log('============================')

  const env = await selectEnvironment()
  console.log(`\n🔐 Logging in to ${env.label} (${env.apiUrl}) as ${process.env[env.emailVar]}...`)
  const jwt = await login(env)
  const apiUrl = `${env.apiUrl}/api/translations`
  const token = `Bearer ${jwt}`
  console.log('✅ Logged in.\n')

  console.log('This tool imports translations from JSON files to Strapi CMS.')
  console.log('Only new translations will be imported, existing ones will be skipped.\n')

  let totalImported = 0
  let totalSkipped = 0
  const startTime = Date.now()

  for (const { file, locale } of TRANSLATION_FILES) {
    try {
      console.log(`📂 Loading translations from: ${file}`)
      const translations = require(file)
      const translationCount = Object.keys(flattenTranslations(translations)).length
      console.log(`   Found ${translationCount} translations for locale: ${locale}\n`)

      const result = await importTranslationsForLocale(apiUrl, token, translations, locale)

      totalImported += result.importedCount
      totalSkipped += result.skippedCount

      console.log(`\n📊 Results for ${locale}:`)
      console.log(`   ✅ Imported: ${result.importedCount}`)
      console.log(`   ⏭️  Skipped:  ${result.skippedCount}\n`)

    } catch (error) {
      console.error(`❌ Failed to load translation file: ${file}`)
      console.error(`   Error: ${error.message}\n`)
      process.exit(1)
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000)

  console.log('🎯 Final Summary')
  console.log('================')
  console.log(`Environment:      ${env.label}`)
  console.log(`✅ Total Imported: ${totalImported}`)
  console.log(`⏭️  Total Skipped:  ${totalSkipped}`)
  console.log(`⏱️  Duration:      ${duration}s`)
  console.log('')

  if (totalImported === 0 && totalSkipped > 0) {
    console.log('ℹ️  All translations already exist in the database.')
  } else if (totalImported > 0) {
    console.log('🎉 Translation import completed successfully!')
  }
}

// Run the import
importAllTranslations().catch(error => {
  console.error('💥 Fatal error during import:', error.message)
  process.exit(1)
})
