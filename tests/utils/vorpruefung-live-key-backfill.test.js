"use strict";

const { backfillVorpruefungLiveKeys } = require("../../src/utils/vorpruefung-live-key-backfill");

function makeStrapi({ missing, taken = [] }) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const builder = (rows) => {
    const chain = {
      join: () => chain,
      whereNull: () => chain,
      whereNotNull: () => chain,
      orderBy: () => chain,
      select: () => Promise.resolve(rows),
    };
    return chain;
  };
  let call = 0;
  const knex = jest.fn(() => builder(call++ === 0 ? missing : taken.map((liveKey) => ({ live_key: liveKey }))));
  return {
    updateMany,
    strapi: {
      db: { connection: knex, query: () => ({ updateMany }) },
      log: { info: jest.fn(), error: jest.fn() },
    },
  };
}

describe("backfillVorpruefungLiveKeys", () => {
  test("does nothing when every live request already has a key", async () => {
    const { strapi, updateMany } = makeStrapi({ missing: [] });

    await expect(backfillVorpruefungLiveKeys(strapi)).resolves.toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  test("keys the newest live request and retires older duplicates", async () => {
    const { strapi, updateMany } = makeStrapi({
      missing: [
        { id: 9, type: "finanzen", projectId: 42 },
        { id: 4, type: "finanzen", projectId: 42 },
        { id: 8, type: "personal", projectId: 42 },
      ],
    });

    await expect(backfillVorpruefungLiveKeys(strapi)).resolves.toBe(2);

    expect(updateMany).toHaveBeenCalledWith({ where: { id: 9, liveKey: null }, data: { liveKey: "42:finanzen" } });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 4, supersededAt: null },
      data: { supersededAt: expect.any(Date), supersededReason: "resend" },
    });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 8, liveKey: null }, data: { liveKey: "42:personal" } });
  });

  test("a request whose key is already taken by a keyed live row is retired", async () => {
    const { strapi, updateMany } = makeStrapi({
      missing: [{ id: 4, type: "finanzen", projectId: 42 }],
      taken: ["42:finanzen"],
    });

    await backfillVorpruefungLiveKeys(strapi);

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0].data.supersededReason).toBe("resend");
  });

  test("never throws, so a failure cannot stop the boot", async () => {
    const strapi = {
      db: { connection: () => { throw new Error("no table"); } },
      log: { info: jest.fn(), error: jest.fn() },
    };

    await expect(backfillVorpruefungLiveKeys(strapi)).resolves.toBe(0);
    expect(strapi.log.error).toHaveBeenCalled();
  });
});
