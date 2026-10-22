/**
 * Pure planner for the hierarchy-path migration (see migrate-to-chain.js).
 * Takes plain row arrays, returns what to delete/clear and what to report.
 * The chain is location -> municipality -> landkreis -> federal state; every
 * relation is many-to-many, so ancestry is the union over all parents.
 */

const TABLES = {
  municipalityFederalStates: "municipalities_federal_states_links",
  locationFederalStates: "locations_federal_states_links",
  locationLandkreise: "locations_landkreise_links",
}

const groupBy = (rows, keyOf, valueOf) => {
  const map = new Map()
  rows.forEach((row) => {
    const key = keyOf(row)
    if (!map.has(key)) map.set(key, new Set())
    map.get(key).add(valueOf(row))
  })
  return map
}

const valuesOf = (map, key) => map.get(key) || new Set()

const union = (sets) => new Set(sets.flatMap((s) => [...s]))

function planMigration(snapshot) {
  const {
    landkreisFederalStates = [],
    landkreisMunicipalities = [],
    locationMunicipalities = [],
    municipalityFederalStates = [],
    locationFederalStates = [],
    locationLandkreise = [],
    userDetails = [],
  } = snapshot

  const statesOfLandkreis = groupBy(landkreisFederalStates, (r) => r.landkreis_id, (r) => r.federal_state_id)
  const landkreiseOfMunicipality = groupBy(landkreisMunicipalities, (r) => r.municipality_id, (r) => r.landkreis_id)
  const municipalitiesOfLandkreis = groupBy(landkreisMunicipalities, (r) => r.landkreis_id, (r) => r.municipality_id)
  const municipalitiesOfLocation = groupBy(locationMunicipalities, (r) => r.location_id, (r) => r.municipality_id)
  const locationsOfMunicipality = groupBy(locationMunicipalities, (r) => r.municipality_id, (r) => r.location_id)

  const landkreiseOfMunicipalities = (municipalityIds) =>
    union([...municipalityIds].map((m) => valuesOf(landkreiseOfMunicipality, m)))
  const statesOfLandkreise = (landkreisIds) =>
    union([...landkreisIds].map((lk) => valuesOf(statesOfLandkreis, lk)))
  const statesOfMunicipality = (municipalityId) =>
    statesOfLandkreise(valuesOf(landkreiseOfMunicipality, municipalityId))

  const municipalities = snapshot.municipalities ?? [
    ...new Set([
      ...landkreisMunicipalities.map((r) => r.municipality_id),
      ...locationMunicipalities.map((r) => r.municipality_id),
      ...municipalityFederalStates.map((r) => r.municipality_id),
    ]),
  ].map((id) => ({ id, title: null }))
  const municipalityTitle = new Map(municipalities.map((m) => [m.id, m.title ?? null]))
  const municipalityRef = (id) => ({ id, title: municipalityTitle.get(id) ?? null })

  const deleteLinks = []
  const unreachableShortcuts = []

  const triage = (table, row, isReachable, describe) => {
    if (isReachable) deleteLinks.push({ table, id: row.id })
    else unreachableShortcuts.push({ table, id: row.id, ...describe })
  }

  municipalityFederalStates.forEach((row) => {
    const chainStates = statesOfMunicipality(row.municipality_id)
    triage(
      TABLES.municipalityFederalStates,
      row,
      chainStates.has(row.federal_state_id),
      {
        municipality: municipalityRef(row.municipality_id),
        target: row.federal_state_id,
        chain: [...chainStates],
      }
    )
  })

  locationFederalStates.forEach((row) => {
    const municipalityIds = valuesOf(municipalitiesOfLocation, row.location_id)
    const chainStates = statesOfLandkreise(landkreiseOfMunicipalities(municipalityIds))
    triage(
      TABLES.locationFederalStates,
      row,
      chainStates.has(row.federal_state_id),
      { location: row.location_id, target: row.federal_state_id, chain: [...chainStates] }
    )
  })

  locationLandkreise.forEach((row) => {
    const municipalityIds = valuesOf(municipalitiesOfLocation, row.location_id)
    const chainLandkreise = landkreiseOfMunicipalities(municipalityIds)
    triage(
      TABLES.locationLandkreise,
      row,
      chainLandkreise.has(row.landkreis_id),
      { location: row.location_id, target: row.landkreis_id, chain: [...chainLandkreise] }
    )
  })

  const municipalitiesWithoutState = municipalities
    .filter((m) => statesOfMunicipality(m.id).size === 0)
    .map((m) => municipalityRef(m.id))

  const locationsInScope = (user) => {
    if (user.municipality) return valuesOf(locationsOfMunicipality, user.municipality)
    return union(
      [...valuesOf(municipalitiesOfLandkreis, user.landkreis)].map((m) => valuesOf(locationsOfMunicipality, m))
    )
  }

  const userUpdates = []
  const usersWithoutAnchor = []
  const guestsWithoutLocation = []
  const ortOutsideScope = []

  userDetails.forEach((user) => {
    const ref = { userDetailId: user.id, username: user.username, roleType: user.roleType }

    const clear = []
    if (user.federalState) clear.push("federalState")
    if (user.landkreis && user.municipality) clear.push("landkreis")
    if (clear.length > 0) userUpdates.push({ userDetailId: user.id, clear })

    if (user.roleType === "guest") {
      if (!user.assignedLocation) guestsWithoutLocation.push(ref)
      return
    }
    if (user.roleType === "admin") return

    if (!user.municipality && !user.landkreis) {
      usersWithoutAnchor.push(ref)
      return
    }
    if (user.assignedLocation && !locationsInScope(user).has(user.assignedLocation)) {
      ortOutsideScope.push({ ...ref, location: user.assignedLocation })
    }
  })

  return {
    deleteLinks,
    userUpdates,
    report: {
      unreachableShortcuts,
      municipalitiesWithoutState,
      usersWithoutAnchor,
      guestsWithoutLocation,
      ortOutsideScope,
    },
  }
}

module.exports = { planMigration }
