"use strict";

const { backfillLocationRelations, REQUIRED_TABLES } = require("../../src/utils/location-relations-backfill");

function makeFakeStrapi({ done = false, existingTables = REQUIRED_TABLES, failOn = null } = {}) {
  const raw = jest.fn(async () => {
    if (failOn !== null && raw.mock.calls.length === failOn + 1) throw new Error("boom");
  });
  const strapi = {
    store: {
      get: jest.fn(async () => (done ? { doneAt: "earlier" } : null)),
      set: jest.fn(async () => {}),
    },
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    db: {
      connection: {
        schema: { hasTable: jest.fn(async (table) => existingTables.includes(table)) },
        transaction: jest.fn(async (fn) => fn({ raw })),
      },
    },
  };
  return { strapi, raw };
}

describe("backfillLocationRelations", () => {
  test("runs the three backfill statements in one transaction and records that it is done", async () => {
    const { strapi, raw } = makeFakeStrapi();
    expect(await backfillLocationRelations(strapi)).toBe(true);
    expect(strapi.db.connection.transaction).toHaveBeenCalledTimes(1);
    expect(raw).toHaveBeenCalledTimes(3);
    expect(strapi.store.set).toHaveBeenCalledWith(
      expect.objectContaining({ key: "location-relations", value: { doneAt: expect.any(String) } })
    );
  });

  test("does nothing once it has been recorded as done", async () => {
    const { strapi, raw } = makeFakeStrapi({ done: true });
    expect(await backfillLocationRelations(strapi)).toBe(false);
    expect(raw).not.toHaveBeenCalled();
    expect(strapi.store.set).not.toHaveBeenCalled();
  });

  test("skips without failing when a link table does not exist yet, and is not recorded as done", async () => {
    const { strapi, raw } = makeFakeStrapi({ existingTables: [REQUIRED_TABLES[0]] });
    expect(await backfillLocationRelations(strapi)).toBe(false);
    expect(raw).not.toHaveBeenCalled();
    expect(strapi.store.set).not.toHaveBeenCalled();
    expect(strapi.log.warn).toHaveBeenCalledTimes(1);
  });

  test("never throws: a failing statement is logged, not recorded as done, and retried next boot", async () => {
    const { strapi } = makeFakeStrapi({ failOn: 1 });
    await expect(backfillLocationRelations(strapi)).resolves.toBe(false);
    expect(strapi.store.set).not.toHaveBeenCalled();
    expect(strapi.log.error).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });
});
