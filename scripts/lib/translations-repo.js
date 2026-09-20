/**
 * Reads/writes the BE repo's de.json/en.json, the FE repo's i18n json files
 * (if checked out as a sibling directory), and the prod sync snapshot file,
 * for scripts/translations/sync.js.
 */

const fs = require('fs')
const path = require('path')
const { flatten, unflatten } = require('./flatten')

const BE_ROOT = path.join(__dirname, '..', '..')
const SNAPSHOT_PATH = path.join(__dirname, '..', 'translations', 'snapshot.prod.json')

const LOCALE_FILES = {
  de: {
    beFile: path.join(BE_ROOT, 'de.json'),
    feFile: path.join(BE_ROOT, '..', 'Forderscouting-Plattform', 'src', 'i18n', 'de', 'index.json')
  },
  en: {
    beFile: path.join(BE_ROOT, 'en.json'),
    feFile: path.join(BE_ROOT, '..', 'Forderscouting-Plattform', 'src', 'i18n', 'en-us', 'index.json')
  }
}

function loadLocalFlat() {
  const result = {}
  for (const locale of Object.keys(LOCALE_FILES)) {
    delete require.cache[require.resolve(LOCALE_FILES[locale].beFile)]
    const nested = require(LOCALE_FILES[locale].beFile)
    result[locale] = flatten(nested)
  }
  return result
}

function writeLocalFlat(localFlat, { alsoWriteFe = false } = {}) {
  const feWritten = []
  for (const locale of Object.keys(LOCALE_FILES)) {
    const nested = unflatten(localFlat[locale] || {})
    const json = JSON.stringify(nested, null, 2) + '\n'
    fs.writeFileSync(LOCALE_FILES[locale].beFile, json)

    if (alsoWriteFe) {
      const feFile = LOCALE_FILES[locale].feFile
      if (fs.existsSync(path.dirname(feFile))) {
        fs.writeFileSync(feFile, json)
        feWritten.push(feFile)
      }
    }
  }
  return { feWritten }
}

function loadSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    return { version: 1, generatedAt: null, entries: {} }
  }
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
}

function writeSnapshot(entries) {
  const snapshot = {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries
  }
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n')
}

module.exports = {
  LOCALE_FILES,
  SNAPSHOT_PATH,
  loadLocalFlat,
  writeLocalFlat,
  loadSnapshot,
  writeSnapshot
}
