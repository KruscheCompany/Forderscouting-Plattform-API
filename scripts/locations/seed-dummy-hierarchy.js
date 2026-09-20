/**
 * Dummy Hierarchy Seeder (local only)
 *
 * Seeds the local Strapi DB with fictional federal-state / landkreis /
 * municipality rows, for exercising the funding-edit cascading selects
 * and their "Select All" toggles in the frontend.
 *
 * Usage:
 * 1. Set STRAPI_API_URL_LOCAL and TRANSLATE_EMAIL_AUTH_LOCAL /
 *    TRANSLATE_EMAIL_PASS_LOCAL in .env
 * 2. Run: node scripts/locations/seed-dummy-hierarchy.js
 *
 * Always targets "local" - never prompts for an environment.
 *
 * Requirements:
 * - Node.js with axios package
 */

const axios = require('axios')
const { ENVIRONMENTS, login } = require('../lib/http-env')

const HIERARCHY = {
  "Dummy-Land Nord": {
    "Testkreis Alpha": ["Musterdorf Alpha-1", "Musterdorf Alpha-2", "Musterdorf Alpha-3"],
    "Testkreis Beta": ["Musterdorf Beta-1", "Musterdorf Beta-2", "Musterdorf Beta-3"]
  },
  "Dummy-Land Süd": {
    "Testkreis Gamma": ["Musterdorf Gamma-1", "Musterdorf Gamma-2", "Musterdorf Gamma-3"],
    "Testkreis Delta": ["Musterdorf Delta-1", "Musterdorf Delta-2", "Musterdorf Delta-3"]
  }
}

async function createEntry(apiUrl, token, endpoint, data) {
  const response = await axios.post(`${apiUrl}/api/${endpoint}`, { data }, {
    headers: { Authorization: token }
  })
  return response.data.data
}

async function seedHierarchy(apiUrl, token, hierarchy) {
  let created = 0
  let failed = 0

  for (const [federalStateTitle, landkreise] of Object.entries(hierarchy)) {
    let federalState
    try {
      federalState = await createEntry(apiUrl, token, 'federal-states', { title: federalStateTitle })
      console.log(`✅ Created federal state "${federalStateTitle}"`)
      created++
    } catch (error) {
      console.error(`❌ Failed to create federal state "${federalStateTitle}": ${error.message}`)
      failed++
      continue
    }

    for (const [landkreisTitle, municipalities] of Object.entries(landkreise)) {
      let landkreis
      try {
        landkreis = await createEntry(apiUrl, token, 'landkreise', {
          title: landkreisTitle,
          federalStates: [federalState.id]
        })
        console.log(`✅ Created landkreis "${landkreisTitle}"`)
        created++
      } catch (error) {
        console.error(`❌ Failed to create landkreis "${landkreisTitle}": ${error.message}`)
        failed++
        continue
      }

      for (const municipalityTitle of municipalities) {
        try {
          await createEntry(apiUrl, token, 'municipalities', {
            title: municipalityTitle,
            location: municipalityTitle,
            federalStates: [federalState.id],
            landkreise: [landkreis.id]
          })
          console.log(`✅ Created municipality "${municipalityTitle}"`)
          created++
        } catch (error) {
          console.error(`❌ Failed to create municipality "${municipalityTitle}": ${error.message}`)
          failed++
        }
      }
    }
  }

  return { created, failed }
}

async function run() {
  console.log('🚀 Dummy Hierarchy Seeder (local)')
  console.log('==================================')

  const env = ENVIRONMENTS.local
  console.log(`\n🔐 Logging in to ${env.label} (${env.apiUrl}) as ${process.env[env.emailVar]}...`)
  const jwt = await login(env)
  const token = `Bearer ${jwt}`
  console.log('✅ Logged in.\n')

  const { created, failed } = await seedHierarchy(env.apiUrl, token, HIERARCHY)

  console.log('\n🎯 Final Summary')
  console.log('================')
  console.log(`Environment: ${env.label}`)
  console.log(`✅ Created:   ${created}`)
  console.log(`❌ Failed:    ${failed}`)
}

run().catch(error => {
  console.error('💥 Fatal error during seeding:', error.message)
  process.exit(1)
})
