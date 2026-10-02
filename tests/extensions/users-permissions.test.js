"use strict";

const extend = require("../../src/extensions/users-permissions/strapi-server");

const USER = "plugin::users-permissions.user";
const DETAIL = "api::user-detail.user-detail";

function makeFakeStrapi({ users = [], callerDetail = { municipality: { id: 1 } }, emailError, detailError, registerError } = {}) {
  const store = { users: [...users], details: [], nextUserId: 1000, nextDetailId: 2000, calls: [] };

  const strapi = {
    store,
    log: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
    db: {
      query: () => ({
        findMany: async () => [
          { id: 1, name: "Admin" },
          { id: 2, name: "user" },
          { id: 3, name: "Guest" },
          { id: 4, name: "Leader" },
        ],
      }),
    },
    entityService: {
      findMany: async (uid) => (uid === USER ? store.users : []),
      findOne: async (uid) => (uid === USER ? { id: 1, user_detail: callerDetail } : null),
      create: async (uid) => {
        if (uid !== DETAIL) throw new Error(`unexpected create ${uid}`);
        if (detailError) throw detailError;
        const detail = { id: store.nextDetailId++ };
        store.details.push(detail);
        return detail;
      },
      delete: async (uid, id) => {
        store.calls.push(`delete:${uid}:${id}`);
        if (uid === DETAIL) store.details = store.details.filter((d) => d.id !== id);
        if (uid === USER) store.users = store.users.filter((u) => u.id !== id);
      },
    },
    query: () => ({
      findOne: async ({ where }) => store.users.find((u) => u.email === where.email) || null,
      update: async ({ where, data }) => {
        store.calls.push("update-user");
        const user = store.users.find((u) => u.id === where.id);
        Object.assign(user, data);
      },
    }),
    controller: () => ({
      register: async (ctx) => {
        if (registerError) throw registerError;
        store.users.push({ id: store.nextUserId++, email: ctx.request.body.email });
      },
    }),
    plugins: {
      email: {
        services: {
          email: {
            send: async () => {
              store.calls.push("send-email");
              if (emailError) throw emailError;
            },
          },
        },
      },
    },
  };
  return strapi;
}

function makeCtx(body = {}) {
  return {
    request: { headers: {}, body: { email: "new@example.de", username: "New User", role: "user", message: "hi", ...body } },
    state: { user: { id: 1 } },
    badRequest: jest.fn((message) => ({ badRequest: message })),
  };
}

function loadPlugin(strapi) {
  global.strapi = strapi;
  const plugin = extend({ controllers: { auth: { callback: jest.fn() }, user: {} } }, {});
  return plugin.controllers.user;
}

afterEach(() => {
  delete global.strapi;
});

describe("user.find", () => {
  const detail = (id, title) => ({ municipality: { id, title } });

  it("returns every user instead of throwing when one has no user_detail", async () => {
    const users = [
      { id: 1, username: "a", user_detail: detail(1, "Alpha") },
      { id: 2, username: "orphan", user_detail: null },
      { id: 3, username: "b", user_detail: detail(2, "Beta") },
    ];
    const controller = loadPlugin(makeFakeStrapi({ users }));
    const ctx = makeCtx();

    await controller.find(ctx);

    expect(ctx.body.map((u) => u.id).sort()).toEqual([1, 2, 3]);
  });

  it("does not throw when the calling user has no user_detail", async () => {
    const users = [{ id: 1, username: "a", user_detail: detail(1, "Alpha") }];
    const controller = loadPlugin(makeFakeStrapi({ users, callerDetail: null }));
    const ctx = makeCtx();

    await controller.find(ctx);

    expect(ctx.body).toHaveLength(1);
  });

  it("still puts the caller's own scope first", async () => {
    const users = [
      { id: 1, username: "other", user_detail: detail(2, "Beta") },
      { id: 2, username: "mine", user_detail: detail(1, "Zeta") },
    ];
    const controller = loadPlugin(makeFakeStrapi({ users, callerDetail: { municipality: { id: 1 } } }));
    const ctx = makeCtx();

    await controller.find(ctx);

    expect(ctx.body.map((u) => u.id)).toEqual([2, 1]);
  });
});

describe("user.create", () => {
  it("rolls the user back when the invite email fails", async () => {
    const strapi = makeFakeStrapi({ emailError: new Error("SMTP timeout") });
    const controller = loadPlugin(strapi);
    const ctx = makeCtx();

    await controller.create(ctx);

    expect(ctx.badRequest).toHaveBeenCalledWith("SMTP timeout", undefined);
    expect(strapi.store.users).toHaveLength(0);
    expect(strapi.store.details).toHaveLength(0);
  });

  it("rolls the user back when the user_detail cannot be created", async () => {
    const strapi = makeFakeStrapi({ detailError: new Error("detail failed") });
    const controller = loadPlugin(strapi);
    const ctx = makeCtx();

    await controller.create(ctx);

    expect(ctx.badRequest).toHaveBeenCalled();
    expect(strapi.store.users).toHaveLength(0);
  });

  it("deletes nothing when registration itself fails", async () => {
    const strapi = makeFakeStrapi({ registerError: new Error("Email already taken") });
    const controller = loadPlugin(strapi);
    const ctx = makeCtx();

    await controller.create(ctx);

    expect(ctx.badRequest).toHaveBeenCalledWith("Email already taken", undefined);
    expect(strapi.store.calls).toEqual([]);
  });

  it("keeps the user with a detail and saves the reset token before emailing", async () => {
    const strapi = makeFakeStrapi();
    const controller = loadPlugin(strapi);
    const ctx = makeCtx();

    await controller.create(ctx);

    expect(ctx.badRequest).not.toHaveBeenCalled();
    expect(strapi.store.users).toHaveLength(1);
    expect(strapi.store.users[0].resetPasswordToken).toEqual(expect.any(String));
    expect(strapi.store.users[0].user_detail).toEqual(strapi.store.details[0]);
    expect(strapi.store.calls).toEqual(["update-user", "send-email"]);
  });
});
