"use strict";

const { planMigration } = require("../../scripts/hierarchy/plan");

const user = (id, roleType, levels = {}) => ({
  id,
  username: `user${id}`,
  roleType,
  municipality: null,
  landkreis: null,
  federalState: null,
  assignedLocation: null,
  ...levels,
});

// Prod-shaped: state 1 (Schleswig-Holstein) > Landkreis 10 > municipalities 56, 57;
// municipality 63 "Kreis Ostholstein" has a direct state link and no Landkreis.
const makeSnapshot = (overrides = {}) => ({
  municipalities: [
    { id: 56, title: "Husum" },
    { id: 57, title: "Tönning" },
    { id: 63, title: "Kreis Ostholstein" },
  ],
  landkreisFederalStates: [{ id: 1, landkreis_id: 10, federal_state_id: 1 }],
  landkreisMunicipalities: [
    { id: 1, landkreis_id: 10, municipality_id: 56 },
    { id: 2, landkreis_id: 10, municipality_id: 57 },
  ],
  municipalityFederalStates: [
    { id: 100, municipality_id: 56, federal_state_id: 1 },
    { id: 101, municipality_id: 63, federal_state_id: 1 },
  ],
  locationMunicipalities: [
    { id: 1, location_id: 500, municipality_id: 56 },
    { id: 2, location_id: 501, municipality_id: 57 },
    { id: 3, location_id: 502, municipality_id: 63 },
  ],
  locationFederalStates: [],
  locationLandkreise: [],
  userDetails: [],
  ...overrides,
});

describe("planMigration", () => {
  test("drops municipality→state shortcut reachable via landkreis", () => {
    const plan = planMigration(makeSnapshot());
    expect(plan.deleteLinks).toEqual([{ table: "municipalities_federal_states_links", id: 100 }]);
    expect(plan.report.unreachableShortcuts.map((s) => s.id)).not.toContain(100);
  });

  test("keeps and reports shortcut not reachable", () => {
    const plan = planMigration(makeSnapshot());
    expect(plan.deleteLinks.map((l) => l.id)).not.toContain(101);
    expect(plan.report.unreachableShortcuts).toEqual([
      expect.objectContaining({
        table: "municipalities_federal_states_links",
        id: 101,
        municipality: { id: 63, title: "Kreis Ostholstein" },
        target: 1,
      }),
    ]);
    expect(plan.report.municipalitiesWithoutState).toEqual([{ id: 63, title: "Kreis Ostholstein" }]);
  });

  test("handles location shortcuts: drops reachable, reports unreachable", () => {
    const plan = planMigration(
      makeSnapshot({
        locationFederalStates: [
          { id: 20, location_id: 500, federal_state_id: 1 },
          { id: 21, location_id: 502, federal_state_id: 1 },
        ],
        locationLandkreise: [
          { id: 30, location_id: 500, landkreis_id: 10 },
          { id: 31, location_id: 502, landkreis_id: 10 },
        ],
      })
    );
    const deleted = plan.deleteLinks.map((l) => `${l.table}:${l.id}`);
    expect(deleted).toEqual(
      expect.arrayContaining(["locations_federal_states_links:20", "locations_landkreise_links:30"])
    );
    expect(deleted).not.toContain("locations_federal_states_links:21");
    expect(deleted).not.toContain("locations_landkreise_links:31");
    expect(plan.report.unreachableShortcuts.map((s) => `${s.table}:${s.id}`)).toEqual(
      expect.arrayContaining(["locations_federal_states_links:21", "locations_landkreise_links:31"])
    );
  });

  test("a municipality in two landkreise reaches the state of either", () => {
    const plan = planMigration(
      makeSnapshot({
        landkreisFederalStates: [
          { id: 1, landkreis_id: 10, federal_state_id: 1 },
          { id: 2, landkreis_id: 11, federal_state_id: 2 },
        ],
        landkreisMunicipalities: [
          { id: 1, landkreis_id: 10, municipality_id: 56 },
          { id: 2, landkreis_id: 11, municipality_id: 56 },
        ],
        municipalityFederalStates: [{ id: 100, municipality_id: 56, federal_state_id: 2 }],
      })
    );
    expect(plan.deleteLinks).toEqual([{ table: "municipalities_federal_states_links", id: 100 }]);
  });

  test("clears federalState and landkreis on municipality leader", () => {
    const plan = planMigration(
      makeSnapshot({
        userDetails: [user(321, "leader", { municipality: 56, landkreis: 10, federalState: 1 })],
      })
    );
    expect(plan.userUpdates).toEqual([{ userDetailId: 321, clear: ["federalState", "landkreis"] }]);
  });

  test("clears only federalState when a municipality user has no landkreis", () => {
    const plan = planMigration(
      makeSnapshot({ userDetails: [user(7, "authenticated", { municipality: 56, federalState: 1 })] })
    );
    expect(plan.userUpdates).toEqual([{ userDetailId: 7, clear: ["federalState"] }]);
  });

  test("keeps landkreis-only user untouched", () => {
    const plan = planMigration(
      makeSnapshot({ userDetails: [user(43, "authenticated", { landkreis: 10 })] })
    );
    expect(plan.userUpdates).toEqual([]);
    expect(plan.report.usersWithoutAnchor).toEqual([]);
    expect(plan.report.guestsWithoutLocation).toEqual([]);
    expect(plan.report.ortOutsideScope).toEqual([]);
  });

  test("reports non-guest without municipality or landkreis, not admins", () => {
    const plan = planMigration(
      makeSnapshot({
        userDetails: [
          user(8, "authenticated", { federalState: 1 }),
          user(9, "admin"),
        ],
      })
    );
    expect(plan.report.usersWithoutAnchor).toEqual([
      expect.objectContaining({ userDetailId: 8, username: "user8", roleType: "authenticated" }),
    ]);
    expect(plan.userUpdates).toEqual([{ userDetailId: 8, clear: ["federalState"] }]);
  });

  test("reports guest without location", () => {
    const plan = planMigration(
      makeSnapshot({
        userDetails: [user(316, "guest"), user(317, "guest", { assignedLocation: 500 })],
      })
    );
    expect(plan.report.guestsWithoutLocation).toEqual([
      expect.objectContaining({ userDetailId: 316, username: "user316" }),
    ]);
    expect(plan.report.usersWithoutAnchor).toEqual([]);
  });

  test("keeps Ort inside municipality", () => {
    const plan = planMigration(
      makeSnapshot({
        userDetails: [
          user(1, "authenticated", { municipality: 56, assignedLocation: 500 }),
          user(2, "authenticated", { landkreis: 10, assignedLocation: 501 }),
        ],
      })
    );
    expect(plan.report.ortOutsideScope).toEqual([]);
    expect(plan.userUpdates).toEqual([]);
  });

  test("reports Ort outside the anchor's scope but keeps it", () => {
    const plan = planMigration(
      makeSnapshot({
        userDetails: [user(1, "authenticated", { municipality: 56, assignedLocation: 501 })],
      })
    );
    expect(plan.report.ortOutsideScope).toEqual([
      expect.objectContaining({ userDetailId: 1, location: 501 }),
    ]);
    expect(plan.userUpdates).toEqual([]);
  });
});
