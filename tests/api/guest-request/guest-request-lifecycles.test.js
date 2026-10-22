"use strict";

const mockFindOne = jest.fn();
const mockFindMany = jest.fn();
const mockEmailSend = jest.fn();
const mockEmitToUser = jest.fn();

jest.mock("../../../src/utils/socket", () => ({ emitToUser: (...args) => mockEmitToUser(...args) }));

global.strapi = {
  entityService: { findOne: mockFindOne, findMany: mockFindMany },
  plugins: { email: { services: { email: { send: mockEmailSend } } } },
};

const lifecycles = require("../../../src/api/guest-request/content-types/guest-request/lifecycles.js");

const notifications = { email: { userJoinRequest: true }, app: { userJoinRequest: true } };
const leader = { id: 2, username: "leader", email: "leader@example.com", user_detail: { notifications } };

beforeEach(() => {
  mockFindOne.mockReset();
  mockFindMany.mockReset();
  mockEmailSend.mockReset();
  mockEmitToUser.mockReset();
  process.env.DEF_FROM = "noreply@example.com";
});

const leaderQuery = () => mockFindMany.mock.calls[1][1];

describe("guest-request afterCreate - municipality leader", () => {
  test("guest request with location lacking landkreis", async () => {
    mockFindOne.mockResolvedValue({ id: 1000, municipality: { id: 100 } });
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([leader]);

    await expect(
      lifecycles.afterCreate({
        params: { data: { email: "g@example.com", municipality: null, assignedLocation: { id: 1000 } } },
      })
    ).resolves.not.toThrow();

    expect(mockFindOne).toHaveBeenCalledWith(
      "api::location.location",
      1000,
      expect.objectContaining({ populate: { municipality: { fields: ["id"] } } })
    );
    expect(leaderQuery().filters.user_detail).toEqual({ municipality: { id: 100 } });
    expect(mockEmailSend).toHaveBeenCalledWith(expect.objectContaining({ to: "leader@example.com" }));
    expect(mockEmitToUser).toHaveBeenCalledWith(2, "notification", { type: "guest" });
  });

  test("an explicit request municipality wins over the location lookup", async () => {
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([leader]);

    await lifecycles.afterCreate({
      params: { data: { email: "g@example.com", municipality: { id: 7 }, assignedLocation: { id: 1000 } } },
    });

    expect(mockFindOne).not.toHaveBeenCalled();
    expect(leaderQuery().filters.user_detail).toEqual({ municipality: { id: 7 } });
  });

  test("a bare location id is accepted", async () => {
    mockFindOne.mockResolvedValue({ id: 1000, municipality: { id: 100 } });
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([leader]);

    await lifecycles.afterCreate({ params: { data: { email: "g@example.com", assignedLocation: 1000 } } });

    expect(mockFindOne.mock.calls[0][1]).toBe(1000);
    expect(leaderQuery().filters.user_detail).toEqual({ municipality: { id: 100 } });
  });

  test("no resolvable municipality skips the leader mail and warns", async () => {
    const warn = jest.fn();
    global.strapi.log = { warn };
    mockFindOne.mockResolvedValue({ id: 1000, municipality: null });
    mockFindMany.mockResolvedValueOnce([]);

    await expect(
      lifecycles.afterCreate({ params: { data: { email: "g@example.com", assignedLocation: { id: 1000 } } } })
    ).resolves.not.toThrow();

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    delete global.strapi.log;
  });
});
