const axios = require('axios')

// Replace with your actual API base URL and auth token
const STRAPI_API = 'http://localhost:1337/api/translations'
const STRAPI_TOKEN = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNzQ4MzU3OTYwLCJleHAiOjE3NTA5NDk5NjB9.GLkc6n-_Y7K212Ak7VZG8Tm68SHaPqACMDcxcXqkPdA'
const LOCALE = 'en'

// Your translation object
const translations = require('./en.json') // save the object you posted as `translations.json`

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

async function importTranslations() {
  const flatTranslations = flattenTranslations(translations)

  for (const [key, value] of Object.entries(flatTranslations)) {
    try {
      const res = await axios.post(STRAPI_API, {
        data: {
          key,
          value,
          locale: LOCALE
        }
      }, {
        headers: {
          Authorization: STRAPI_TOKEN
        }
      })

      console.log(`✅ Imported: ${key}`)
    } catch (error) {
      console.error(`❌ Failed to import: ${key}`, error.response?.data || error.message)
    }
  }
}

importTranslations()
