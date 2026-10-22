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

const lifecycles = require("../../../src/api/request/content-types/request/lifecycles.js");

const notifications = { email: { dataRequests: true }, app: { dataRequests: true } };
const leader = { id: 2, username: "leader", email: "leader@example.com", user_detail: { notifications } };

function ownerDocument(roleType, userDetail) {
  return { title: "Doc", owner: { username: "owner", email: "o@example.com", role: { type: roleType }, user_detail: userDetail } };
}

const event = { params: { data: { project: { id: 3 }, guest: true, type: "view", user: { id: 9 } } } };

beforeEach(() => {
  mockFindOne.mockReset();
  mockFindMany.mockReset();
  mockFind.mockReset();
  mockGetEntry.mockReset();
  mockGetEntry.mockResolvedValue([{ fullName: "Guest" }]);
  mockEmailSend.mockReset();
  process.env.DEF_FROM = "noreply@example.com";
});

describe("request afterCreate - guest access request goes to the owner's leader", () => {
  test("a guest owner is scoped by their location's municipality", async () => {
    mockFindOne.mockResolvedValue(
      ownerDocument("guest", { notifications, municipality: { id: 999 }, assignedLocation: { id: 1000, municipality: { id: 100 } } })
    );
    mockFindMany.mockResolvedValue([leader]);

    await lifecycles.afterCreate(event);

    expect(mockFindMany.mock.calls[0][1].filters.user_detail).toEqual({ municipality: { id: 100 } });
    expect(mockEmailSend).toHaveBeenCalledWith(expect.objectContaining({ to: "leader@example.com" }));
  });

  test("a municipality owner is scoped by their municipality", async () => {
    mockFindOne.mockResolvedValue(ownerDocument("authenticated", { notifications, municipality: { id: 50 } }));
    mockFindMany.mockResolvedValue([leader]);

    await lifecycles.afterCreate(event);

    expect(mockFindMany.mock.calls[0][1].filters.user_detail).toEqual({ municipality: { id: 50 } });
  });

  test("a landkreis-only owner is scoped by their landkreis", async () => {
    mockFindOne.mockResolvedValue(ownerDocument("authenticated", { notifications, municipality: null, landkreis: { id: 10 } }));
    mockFindMany.mockResolvedValue([leader]);

    await lifecycles.afterCreate(event);

    expect(mockFindMany.mock.calls[0][1].filters.user_detail).toEqual({ landkreis: { id: 10 } });
  });

  test("reads the requester's name without resolving their levels", async () => {
    mockFindOne.mockResolvedValue(ownerDocument("authenticated", { notifications, municipality: { id: 50 } }));
    mockFindMany.mockResolvedValue([leader]);

    await lifecycles.afterCreate(event);

    expect(mockFind).not.toHaveBeenCalled();
    expect(mockGetEntry).toHaveBeenCalledWith({ state: { user: { id: 9 } } }, false);
    expect(mockEmailSend.mock.calls[0][0].html).toContain("Guest");
  });

  test("loads what the lookup needs from the owner", async () => {
    mockFindOne.mockResolvedValue(ownerDocument("authenticated", { notifications, municipality: { id: 50 } }));
    mockFindMany.mockResolvedValue([]);

    await lifecycles.afterCreate(event);

    const owner = mockFindOne.mock.calls[0][2].populate.owner;
    expect(owner.populate.role).toBeDefined();
    expect(owner.populate.user_detail.populate.assignedLocation.populate.municipality).toBeDefined();
  });
});
