"use strict";

const mockSuperCreate = jest.fn();
const mockNoticeFindOne = jest.fn();
const mockQueryFindOne = jest.fn();
const mockCreate = jest.fn();
const mockSanitizeOutput = jest.fn((entry) => Promise.resolve(entry));
const mockTransformResponse = jest.fn((entry) => ({ data: entry }));

jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: (uid, cfgFn) => {
      const base = {
        create: mockSuperCreate,
        sanitizeOutput: mockSanitizeOutput,
        transformResponse: mockTransformResponse,
      };
      const own = cfgFn({
        strapi: {
          entityService: { findOne: mockNoticeFindOne, create: mockCreate },
          db: { query: () => ({ findOne: mockQueryFindOne }) },
        },
      });
      return Object.setPrototypeOf(own, base);
    },
  },
}));

const controller = require("../../../../src/api/read-notification/controllers/read-notification.js");

function makeCtx(data, userId = 7) {
  return {
    state: { user: { id: userId } },
    request: { headers: {}, body: { data } },
    notFound: jest.fn((msg) => ({ notFound: true, msg })),
  };
}

beforeEach(() => {
  [mockSuperCreate, mockNoticeFindOne, mockQueryFindOne, mockCreate].forEach((m) => m.mockReset());
});

describe("read-notification create", () => {
  test("other notification types still go through the core create", async () => {
    mockSuperCreate.mockResolvedValue({ data: {} });
    await controller.create(makeCtx({ user: 7, funding_expirey: 3 }));
    expect(mockSuperCreate).toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("a system notice is linked server-side, for the caller only", async () => {
    mockNoticeFindOne.mockResolvedValue({ id: 1 });
    mockQueryFindOne.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 50 });

    await controller.create(makeCtx({ user: 999, system_notice: 1 }));

    expect(mockSuperCreate).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith("api::read-notification.read-notification", {
      data: { user: 7, system_notice: 1 },
    });
  });

  test("marking the same notice read twice does not create a second row", async () => {
    mockNoticeFindOne.mockResolvedValue({ id: 1 });
    mockQueryFindOne.mockResolvedValue({ id: 50 });

    await controller.create(makeCtx({ system_notice: 1 }));

    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("an unknown notice is a 404", async () => {
    mockNoticeFindOne.mockResolvedValue(null);
    const ctx = makeCtx({ system_notice: 404 });

    const result = await controller.create(ctx);

    expect(result.notFound).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
