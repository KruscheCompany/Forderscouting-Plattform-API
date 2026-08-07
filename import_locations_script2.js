/**
 * Strapi Municipality Location Seeder
 *
 * Creates "location" entries under existing municipalities from the
 * MUNICIPALITY_LOCATIONS map below.
 *
 * Usage:
 * 1. Set STRAPI_API_URL_<ENV> and TRANSLATE_EMAIL_AUTH_<ENV> / TRANSLATE_EMAIL_PASS_<ENV>
 *    in .env for the environment you want to seed (LOCAL, DEV, STAGE, PROD)
 * 2. Run: node import_locations_script2.js
 * 3. Pick the target environment when prompted (prod requires typing "prod"
 *    again to confirm)
 *
 * Requirements:
 * - Node.js with axios package
 */

const axios = require('axios')
const { selectEnvironment, login } = require('./strapi-script-env')

const MUNICIPALITY_LOCATIONS = {
  "Amt Eiderstedt": [
    "Sankt Peter-Ording",
    "Tetenbüll",
    "Tümlauer-Koog",
    "Poppenbüll",
    "Garding",
    "Oldenswort",
    "Vollerwiek",
    "Welt",
    "Tating",
    "Osterhever",
    "Norderfriedrichskoog",
    "Kotzenbüll",
    "Katharinenheerd",
    "Grothusenkoog",
    "Garding Kirchspiel",
    "Kirchspiel, Garding",
    "Grothusenkoog",
    "Katharineheerd",
    "Westerhever"
  ],
  "Amt Föhr-Amrum": [
    "Wittdün",
    "Norddorf",
    "Oevenum",
    "Wrixum",
    "Wyk auf Föhr",
    "Midlum",
    "Borgsum",
    "Dunsum",
    "Nieblum",
    "Oldsum",
    "Süderende",
    "Alkersum",
    "Utersum",
    "Witsum"
  ],
  "Amt Landschaft Sylt": [
    "Wenningstedt-Braderup",
    "List",
    "Hörnum",
    "Kampen",
    "Sylt"
  ],
  "Amt Mittleres Nordfriesland": [
    "Bredstedt",
    "Lütjenholm",
    "Struckum",
    "Ahrenshöft",
    "Bargum",
    "Bohmstedt",
    "Bordelum",
    "Breklum",
    "Drelsdorf",
    "Goldebek",
    "Goldelund",
    "Högel",
    "Joldelund",
    "Kolkerheide",
    "Langenhorn",
    "Ockholm",
    "Sönnebüll",
    "Vollstedt",
    "Reußenköge",
    "Almdorf",
    "Reußenköge",
    "Vollstedt"
  ],
  "Amt Nordsee-Treene": [
    "Nordstrand",
    "Hattstedt",
    "Schwabstedt",
    "Süderhöft",
    "Witzwort",
    "Winnert",
    "Wobbenbüll",
    "Elisabeth-Sophien-Koog",
    "Fresendelf",
    "Hude",
    "Koldenbüttel",
    "Mildstedt",
    "Olderup",
    "Ostenfeld",
    "Ramstedt",
    "Rantrum",
    "Seeth",
    "Simonsberg",
    "Südermarsch",
    "Arlewatt",
    "Drage",
    "Horstedt",
    "Oldersbek",
    "Uelvesbüll",
    "Wisch",
    "Hattstedtermarsch",
    "Friedrichstadt",
    "Hattstedtermarsch",
    "Uelvesbüll",
    "Wisch",
    "Wittbek"
  ],
  "Amt Pellworm": [
    "Pellworm",
    "Gröde",
    "Hooge",
    "Langeneß"
  ],
  "Amt Südtondern": [
    "Niebüll",
    "Braderup",
    "Dagebüll",
    "Stedesand",
    "Bosbüll",
    "Stadum",
    "Leck",
    "Achtrup",
    "Aventoft",
    "Humptrup",
    "Karlum",
    "Klanxbüll",
    "Klixbüll",
    "Ladelund",
    "Neukirchen",
    "Niebüll",
    "Risum-Lindholm",
    "Rodenäs",
    "Sprakebüll",
    "Stadum",
    "Stedesand",
    "Süderlügum",
    "Tinningstedt",
    "Uphusum",
    "Westre",
    "Bramstedtlund",
    "Ellhöft",
    "Emmelsbüll-Horsbüll",
    "Enge-Sande",
    "Friedrich-Wilhelm-Lübke-Koog",
    "Galmsbüll",
    "Holm",
    "Lexgaard"
  ],
  "Amt Viöl": [
    "Ahrenviöl",
    "Ahrenviölfeld",
    "Behrendorf",
    "Bondelum",
    "Haselund",
    "Immenstedt",
    "Löwenstedt",
    "Norstedt",
    "Oster-Ohrstedt",
    "Schwesing",
    "Sollwitt",
    "Viöl",
    "Wester-Ohrstedt"
  ],
  "Stadt Husum": [
    "Husum"
  ],
  "Stadt Tönning": [
    "Tönning"
  ],
  "Gemeinde Sylt/Amt Landschaft Sylt": [
    "Sylt"
  ],
  "All": [
    "Sankt Peter-Ording",
    "Tetenbüll",
    "Tümlauer-Koog",
    "Poppenbüll",
    "Garding",
    "Oldenswort",
    "Vollerwiek",
    "Welt",
    "Tating",
    "Osterhever",
    "Norderfriedrichskoog",
    "Kotzenbüll",
    "Katharinenheerd",
    "Grothusenkoog",
    "Garding Kirchspiel",
    "Wittdün",
    "Norddorf",
    "Oevenum",
    "Wrixum",
    "Wyk auf Föhr",
    "Midlum",
    "Borgsum",
    "Dunsum",
    "Nieblum",
    "Oldsum",
    "Süderende",
    "Alkersum",
    "Utersum",
    "Witsum",
    "Wenningstedt-Braderup",
    "List",
    "Hörnum",
    "Kampen",
    "Sylt",
    "Bredstedt",
    "Lütjenholm",
    "Struckum",
    "Ahrenshöft",
    "Bargum",
    "Bohmstedt",
    "Bordelum",
    "Breklum",
    "Drelsdorf",
    "Goldebek",
    "Goldelund",
    "Högel",
    "Joldelund",
    "Kolkerheide",
    "Langenhorn",
    "Ockholm",
    "Sönnebüll",
    "Vollstedt",
    "Reußenköge",
    "Nordstrand",
    "Hattstedt",
    "Schwabstedt",
    "Süderhöft",
    "Witzwort",
    "Winnert",
    "Wobbenbüll",
    "Elisabeth-Sophien-Koog",
    "Fresendelf",
    "Hude",
    "Koldenbüttel",
    "Mildstedt",
    "Olderup",
    "Ostenfeld",
    "Ramstedt",
    "Rantrum",
    "Seeth",
    "Simonsberg",
    "Südermarsch",
    "Arlewatt",
    "Drage",
    "Horstedt",
    "Oldersbek",
    "Uelvesbüll",
    "Wisch",
    "Hattstedtermarsch",
    "Pellworm",
    "Gröde",
    "Hooge",
    "Langeneß",
    "Niebüll",
    "Braderup",
    "Dagebüll",
    "Stedesand",
    "Bosbüll",
    "Stadum",
    "Leck",
    "Achtrup",
    "Aventoft",
    "Humptrup",
    "Karlum",
    "Klanxbüll",
    "Klixbüll",
    "Ladelund",
    "Neukirchen",
    "Niebüll",
    "Risum-Lindholm",
    "Rodenäs",
    "Sprakebüll",
    "Stadum",
    "Stedesand",
    "Süderlügum",
    "Tinningstedt",
    "Uphusum",
    "Westre",
    "Ahrenviöl",
    "Ahrenviölfeld",
    "Behrendorf",
    "Bondelum",
    "Haselund",
    "Immenstedt",
    "Löwenstedt",
    "Norstedt",
    "Oster-Ohrstedt",
    "Schwesing",
    "Sollwitt",
    "Viöl",
    "Wester-Ohrstedt",
    "Husum",
    "Tönning",
    "Sylt",
    "Kirchspiel, Garding",
    "Grothusenkoog",
    "Katharineheerd",
    "Westerhever",
    "Almdorf",
    "Reußenköge",
    "Vollstedt",
    "Friedrichstadt",
    "Hattstedtermarsch",
    "Uelvesbüll",
    "Wisch",
    "Wittbek",
    "Bramstedtlund",
    "Ellhöft",
    "Emmelsbüll-Horsbüll",
    "Enge-Sande",
    "Friedrich-Wilhelm-Lübke-Koog",
    "Galmsbüll",
    "Holm",
    "Lexgaard"
  ]
};

async function fetchMunicipalities(apiUrl, token) {
  const response = await axios.get(`${apiUrl}/api/municipalities`, {
    headers: { Authorization: token }
  })
  return response.data
}

async function createLocation(apiUrl, token, data) {
  const response = await axios.post(`${apiUrl}/api/locations`, { data }, {
    headers: { Authorization: token }
  })
  return response.data
}

async function seedMunicipalityLocations(apiUrl, token, municipalityLocations) {
  const municipalities = await fetchMunicipalities(apiUrl, token)
  let created = 0
  let failed = 0

  for (const [municipalityTitle, locations] of Object.entries(municipalityLocations)) {
    const municipality = municipalities.find(m => m.title === municipalityTitle)
    if (!municipality) {
      console.error(`❌ Municipality not found: "${municipalityTitle}"`)
      continue
    }

    for (const location of locations) {
      try {
        await createLocation(apiUrl, token, { title: location, municipality: municipality.id })
        console.log(`✅ Created "${location}" under "${municipalityTitle}"`)
        created++
      } catch (error) {
        console.error(`❌ Failed to create "${location}" under "${municipalityTitle}": ${error.message}`)
        failed++
      }
    }
  }

  return { created, failed }
}

async function run() {
  console.log('🚀 Municipality Location Seeder')
  console.log('================================')

  const env = await selectEnvironment()
  console.log(`\n🔐 Logging in to ${env.label} (${env.apiUrl}) as ${process.env[env.emailVar]}...`)
  const jwt = await login(env)
  const token = `Bearer ${jwt}`
  console.log('✅ Logged in.\n')

  const { created, failed } = await seedMunicipalityLocations(env.apiUrl, token, MUNICIPALITY_LOCATIONS)

  console.log('\n🎯 Final Summary')
  console.log('================')
  console.log(`Environment: ${env.label}`)
  console.log(`✅ Created:   ${created}`)
  console.log(`❌ Failed:    ${failed}`)
}

run().catch(error => {
  console.error('💥 Fatal error during import:', error.message)
  process.exit(1)
})
