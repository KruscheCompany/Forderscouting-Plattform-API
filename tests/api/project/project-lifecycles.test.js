"use strict";

const mockFindOne = jest.fn();

global.strapi = {
  db: { query: () => ({ findOne: mockFindOne }) },
  entityService: { findMany: jest.fn(), update: jest.fn() },
};

const lifecycles = require("../../../src/api/project/content-types/project/lifecycles.js");

const run = async (data, stored) => {
  mockFindOne.mockResolvedValue(stored);
  const event = { params: { data, where: { id: 5 } } };
  await lifecycles.beforeUpdate(event);
  return event.params.data;
};

beforeEach(() => mockFindOne.mockReset());

describe("project beforeUpdate - status timestamps", () => {
  test("stamps sentToFundingAt when the project reaches sentToFunding", async () => {
    const data = await run({ status: "sentToFunding" }, { status: null });
    expect(new Date(data.sentToFundingAt).toString()).not.toBe("Invalid Date");
    expect(data.grantNoticeAt).toBeUndefined();
  });

  test("stamps grantNoticeAt when the project reaches grantNotice", async () => {
    const data = await run({ status: "grantNotice" }, { status: "sentToFunding" });
    expect(new Date(data.grantNoticeAt).toString()).not.toBe("Invalid Date");
    expect(data.sentToFundingAt).toBeUndefined();
  });

  test("does not restamp when the unchanged status is saved again", async () => {
    const data = await run({ status: "grantNotice", title: "x" }, { status: "grantNotice" });
    expect(data.grantNoticeAt).toBeUndefined();
  });

  test.each(["rejectionNotice"])(
    "stamps nothing for %s",
    async (status) => {
      const data = await run({ status }, { status: "grantNotice" });
      expect(data.sentToFundingAt).toBeUndefined();
      expect(data.grantNoticeAt).toBeUndefined();
      expect(mockFindOne).not.toHaveBeenCalled();
    }
  );

  test("ignores updates that do not touch the status", async () => {
    const data = await run({ title: "x" }, { status: null });
    expect(data).toEqual({ title: "x" });
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  test("does nothing when the project cannot be found", async () => {
    const data = await run({ status: "sentToFunding" }, null);
    expect(data.sentToFundingAt).toBeUndefined();
  });
});
