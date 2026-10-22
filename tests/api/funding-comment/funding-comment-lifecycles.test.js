"use strict";

const mockFindOne = jest.fn();
const mockFindMany = jest.fn();
const mockEmailSend = jest.fn();
const mockFind = jest.fn();
const mockGetEntry = jest.fn();

jest.mock("../../../src/utils/socket", () => ({ emitToUser: jest.fn() }));

global.strapi = {
  entityService: { findOne: mockFindOne, findMany: mockFindMany },
  plugins: { email: { services: { email: { send: mockEmailSend } } } },
  controller: () => ({ find: mockFind, getEntry: mockGetEntry }),
};

const lifecycles = require("../../../src/api/funding-comment/content-types/funding-comment/lifecycles.js");

const admin = {
  username: "admin",
  email: "admin@example.com",
  user_detail: { notifications: { email: { userJoinRequest: true }, app: {} } },
};

beforeEach(() => {
  mockFindOne.mockReset();
  mockFindMany.mockReset();
  mockFind.mockReset();
  mockGetEntry.mockReset();
  mockEmailSend.mockReset();
  process.env.DEF_FROM = "noreply@example.com";
});

describe("funding-comment afterCreate", () => {
  test("reads the commenter's name without resolving their levels", async () => {
    mockFindOne.mockResolvedValue({ title: "Fund" });
    mockFindMany.mockResolvedValue([admin]);
    mockGetEntry.mockResolvedValue([{ fullName: "Max Muster" }]);

    await lifecycles.afterCreate({ params: { data: { funding: 1, owner: 7, comment: "Hi" } } });

    expect(mockFind).not.toHaveBeenCalled();
    expect(mockGetEntry).toHaveBeenCalledWith({ state: { user: { id: 7 } } }, false);
    expect(mockEmailSend.mock.calls[0][0].html).toContain("Max Muster");
  });
});
