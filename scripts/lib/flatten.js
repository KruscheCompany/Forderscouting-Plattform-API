/**
 * Dot-notation flatten/unflatten for nested translation JSON, shared by
 * scripts/translations/sync.js. Extracted from the old import_translations.js
 * / export_translations.js — same behavior, including the array-leaf guard
 * (arrays are treated as leaf values, never recursed into).
 */

function flatten(obj, prefix = '') {
  const result = {}

  for (const key in obj) {
    const value = obj[key]
    const newKey = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flatten(value, newKey))
    } else {
      result[newKey] = value
    }
  }

  return result
}

function unflatten(flat) {
  const result = {}

  for (const dottedKey of Object.keys(flat)) {
    const parts = dottedKey.split('.')
    let node = result

    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = flat[dottedKey]
      } else {
        node[part] = node[part] || {}
        node = node[part]
      }
    })
  }

  return result
}

module.exports = { flatten, unflatten }
