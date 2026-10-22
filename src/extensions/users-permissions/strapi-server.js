const { t } = require("../../utils/i18n");
const crypto = require("crypto");
const { buildEmailHtml } = require("../../utils/email-template");
const { pickAssignedLevels, validateUserLevels } = require("../../utils/scope-resolver");
const { auditLog } = require("../../utils/audit-log");
// The admin form calls the regular role "user"; Strapi's role.type is "authenticated".
const roleTypeOf = (roleName) => (roleName === "user" ? "authenticated" : roleName);

module.exports = (plugin, env) => {
  const originalAuthCallback = plugin.controllers.auth.callback;

  // No password/JWT ever logged - just the attempted identifier and, on
  // success, the resolved user id. See docs/LOGGING_EXPANSION_PLAN.md Phase 2.
  plugin.controllers.auth.callback = async (ctx) => {
    const identifier = ctx.request.body?.identifier;
    try {
      const result = await originalAuthCallback(ctx);
      auditLog(strapi, ctx, "auth.login", {
        result: "allowed",
        userId: ctx.body?.user?.id,
      });
      return result;
    } catch (error) {
      auditLog(strapi, ctx, "auth.login", {
        result: "denied",
        identifier,
        reason: error.message,
      });
      throw error;
    }
  };

  const sanitizeOutput = (user) => {
    const {
      password,
      resetPasswordToken,
      confirmationToken,
      ...sanitizedUser
    } = user; // be careful, you need to omit other private attributes yourself
    return sanitizedUser;
  };

  plugin.controllers.user.me = async (ctx) => {
    if (!ctx.state.user) {
      return ctx.unauthorized();
    }
    const user = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      ctx.state.user.id,
      {
        fields: ["username", "email"],
        populate: { role: { fields: ["type"] } },
      }
    );

    ctx.body = sanitizeOutput(user);
  };

  plugin.controllers.user.find = async (ctx) => {
    const callerScope = await _getUserScope(ctx);
    const users = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        fields: ["username", "email", "updatedAt"],
        populate: {
          role: { fields: ["type"] },
          user_detail: {
            fields: ["fullName"],
            populate: {
              municipality: { fields: ["title", "verwaltungssitz"] },
              landkreis: { fields: ["title"] },
              assignedLocation: { fields: ["title"] },
            },
          },
        },
        sort: {
          user_detail: {
            fullName: "asc",
          },
        },
      }
    );

    const scopeOf = (user) => {
      const detail = user.user_detail;
      if (detail?.municipality) return { type: "municipality", ...detail.municipality };
      if (detail?.landkreis) return { type: "landkreis", ...detail.landkreis };
      if (detail?.assignedLocation) return { type: "location", ...detail.assignedLocation };
      return null;
    };
    const typeRank = { municipality: 1, landkreis: 2, location: 3 };
    const isCallerScope = (scope) => Boolean(scope && callerScope && scope.type === callerScope.type && scope.id === callerScope.id);

    // Ids and titles are only comparable within one type, so types are ordered
    // first and titles only break ties between scopes of the same type.
    const sortedUsers = users.sort((a, b) => {
      const aScope = scopeOf(a);
      const bScope = scopeOf(b);
      const aIsCaller = isCallerScope(aScope);
      const bIsCaller = isCallerScope(bScope);
      if (aIsCaller !== bIsCaller) return aIsCaller ? -1 : 1;

      const aRank = aScope ? typeRank[aScope.type] : 0;
      const bRank = bScope ? typeRank[bScope.type] : 0;
      if (aRank !== bRank) return aRank - bRank;

      const aTitle = (aScope?.title || "").toLowerCase();
      const bTitle = (bScope?.title || "").toLowerCase();
      if (aTitle < bTitle) return -1;
      if (aTitle > bTitle) return 1;
      return 0;
    });

    ctx.body = sortedUsers.map((user) => sanitizeOutput(user));
  };

  plugin.controllers.user.create = async (ctx) => {
    const rolesDB = await strapi.db
      .query("plugin::users-permissions.role")
      .findMany({
        fields: ["name", "id"],
      });

    var roles = new Object();
    roles.admin = rolesDB.find((x) => x.name == "Admin").id;
    roles.user = rolesDB.find((x) => x.name == "user").id;
    roles.guest = rolesDB.find((x) => x.name == "Guest").id;
    roles.leader = rolesDB.find((x) => x.name == "Leader").id;

    ctx.request.body.password = generatePassword();
    // The FE sends lowercase role names; older clients sent "Guest"/"Leader".
    const roleName = String(ctx.request.body.role || "").toLowerCase();
    const isLeaderInvite = roleName == "leader";
    const levels = pickAssignedLevels(ctx.request.body);
    const levelsError = await validateUserLevels(strapi, { roleType: roleTypeOf(roleName), ...levels });
    if (levelsError) return ctx.badRequest(t(ctx, levelsError));
    let registeredUser;
    let user_detail;
    try {
      if (isLeaderInvite) {
        const leaderExists = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            fields: ["username", "email"],
            filters: {
              role: { type: "leader" },
              user_detail: { municipality: levels.municipalityId },
            },
          }
        );
        if (leaderExists && leaderExists.length > 0) {
          return ctx.badRequest(t(ctx, "Es kann nur eine*n Koordinator*in pro Verwaltung geben."));
        }
      }

      await strapi.controller("plugin::users-permissions.auth").register(ctx);
      registeredUser = await strapi.query("plugin::users-permissions.user").findOne({
        where: { email: ctx.request.body.email },
      });
      const resetPasswordToken = crypto.randomBytes(64).toString("hex");
      user_detail = await strapi.entityService.create(
        "api::user-detail.user-detail",
        {
          data: {
            invite: true,
            municipality: levels.municipalityId,
            landkreis: levels.landkreisId,
            assignedLocation: levels.locationId,
            fullName: ctx.request.body.username,
            location: ctx.request.body.location,
            categories: ctx.request.body.categories,
            notifications: {
              email: {},
              app: {},
            },
          },
        }
      );
      var qdata = { resetPasswordToken, user_detail };
      if (Object.prototype.hasOwnProperty.call(roles, roleName)) qdata.role = { id: roles[roleName] };
      await strapi.query("plugin::users-permissions.user").update({
        where: { id: registeredUser.id },
        data: qdata,
      });
      await sendPwdInEmail(ctx, resetPasswordToken);
    } catch (error) {
      await rollbackInvite(registeredUser, user_detail);
      return ctx.badRequest(error.message, error.details);
    }
  };

  // A half-created invite (user without user_detail) breaks GET /api/users for
  // everyone, so a failed invite must not leave the registered user behind.
  async function rollbackInvite(registeredUser, userDetail) {
    try {
      if (userDetail) await strapi.entityService.delete("api::user-detail.user-detail", userDetail.id);
      if (registeredUser) await strapi.entityService.delete("plugin::users-permissions.user", registeredUser.id);
    } catch (rollbackError) {
      strapi.log.error(`Invite rollback failed: ${rollbackError.message}`, {
        userId: registeredUser?.id,
        stack: rollbackError.stack,
      });
    }
  }
  plugin.controllers.user.update = async (ctx) => {
    const rolesDB = await strapi.db
      .query("plugin::users-permissions.role")
      .findMany({
        fields: ["name", "id"],
      });

    var roles = new Object();
    roles.admin = rolesDB.find((x) => x.name == "Admin").id;
    roles.user = rolesDB.find((x) => x.name == "user").id;
    roles.guest = rolesDB.find((x) => x.name == "Guest").id;
    roles.leader = rolesDB.find((x) => x.name == "Leader").id;

    const roleName = ctx.request.body.data.role;
    ctx.request.body.data.role = { id: roles[roleName] };

    var role = ctx.request.body.data.role.id;

    const levels = pickAssignedLevels(ctx.request.body.data);
    const levelsError = await validateUserLevels(strapi, { roleType: roleTypeOf(roleName), ...levels });
    if (levelsError) return ctx.badRequest(t(ctx, levelsError));

    if (role == roles.leader) {
      const otherLeader = await strapi.db.query("plugin::users-permissions.user").findOne({
        where: {
          id: { $ne: ctx.params.id },
          role: { id: roles.leader },
          user_detail: { municipality: levels.municipalityId },
        },
      });
      if (otherLeader) {
        return ctx.badRequest(t(ctx, "Es kann nur eine*n Koordinator*in pro Verwaltung geben."));
      }
    }

    await strapi.service("plugin::users-permissions.user").edit(ctx.params.id, ctx.request.body.data);
    const [userDetail] = await strapi.entityService.findMany("api::user-detail.user-detail", {
      fields: ["fullName"],
      filters: { user: { id: ctx.params.id } },
    });
    const isGuest = role == roles.guest;
    const sentLocation = Object.prototype.hasOwnProperty.call(ctx.request.body.data, "assignedLocation");
    // Only the anchor is stored; federalState is cleared explicitly so legacy
    // values disappear. A non-guest's assignedLocation is an optional profile
    // field, so it is left untouched unless the form actually sent it.
    return await strapi.db.query("api::user-detail.user-detail").update({
      where: { id: userDetail.id },
      data: {
        federalState: null,
        landkreis: levels.landkreisId,
        municipality: levels.municipalityId,
        ...(isGuest || sentLocation ? { assignedLocation: levels.locationId } : {}),
      },
    });

    // if (ctx.request.body.data.role == "admin")
    //   ctx.request.body.data.role = { id: 3 };
    // if (ctx.request.body.data.role == "user")
    //   ctx.request.body.data.role = { id: 1 };
  };
  plugin.controllers.user.destroy = async (ctx) => {
    if (
      ctx.state.user.id != ctx.request.params.id &&
      ctx.state.user.role.type != "admin"
    ) {
      return ctx.badRequest(t(ctx, "Sie können kein anderes Konto als Ihr eigenes löschen."));
    }
    let res = await strapi
      .controller("api::user-detail.user-detail")
      .countAndGetTransferableData({
        state: { user: { id: ctx.request.params.id } },
      });
    if (
      res.project.length > 0 ||
      res.funding.length > 0
    )
      return ctx.badRequest(t(ctx, "Mit diesem Konto sind Daten verknüpft. Übertragen Sie diese Daten zuerst."));
    else {
      await strapi.query("api::user-detail.user-detail").delete({
        where: { user: ctx.request.params.id },
      });
      await strapi.query("api::request.request").delete({
        where: { user: ctx.request.params.id },
      });
      await strapi.query("api::watchlist.watchlist").delete({
        where: { owner: ctx.request.params.id },
      });

      return strapi
        .query("plugin::users-permissions.user")
        .delete({ where: { id: ctx.request.params.id } });
    }
  };

  function generatePassword() {
    //generate random secure password at least 8 characters long
    var length = 16,
      charset =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*(_+-=[]{}<>/?",
      retVal = "";
    for (var i = 0, n = charset.length; i < length; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
  }
  async function sendPwdInEmail(ctx, resetPasswordToken) {
    await strapi.plugins["email"].services.email.send({
      to: ctx.request.body.email,
      from: process.env.DEF_FROM,
      replyTo: process.env.DEF_FROM,
      subject: "Willkommen bei förderscouting-plattform",
      html: buildEmailHtml({
        bodyHtml: ctx.request.body.message,
        cta: {
          label: "Passwort zurücksetzen",
          url: `${process.env.RESET_PWD_PAGE}${resetPasswordToken}`,
        },
      }),
    });
  }
  async function _getUserScope(ctx) {
    const user = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      ctx.state.user.id,
      {
        fields: ["id"],
        populate: {
          user_detail: {
            populate: {
              municipality: { fields: ["id"] },
              landkreis: { fields: ["id"] },
              assignedLocation: { fields: ["id"] },
            },
          },
        },
      }
    );
    const detail = user.user_detail;
    if (detail?.municipality) return { type: "municipality", id: detail.municipality.id };
    if (detail?.landkreis) return { type: "landkreis", id: detail.landkreis.id };
    if (detail?.assignedLocation) return { type: "location", id: detail.assignedLocation.id };
    return null;
  }
  return plugin;
};
