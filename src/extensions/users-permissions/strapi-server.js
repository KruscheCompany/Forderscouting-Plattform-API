const { t } = require("../../utils/i18n");
const crypto = require("crypto");
const { buildEmailHtml } = require("../../utils/email-template");
const { pickAssignedLevels, areLevelsConsistent } = require("../../utils/scope-resolver");
module.exports = (plugin, env) => {
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
    const userScopeId = await _getUserScopeId(ctx);
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
              federalState: { fields: ["title"] },
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

    const sortedUsers = users.sort((a, b) => {
      const aScope = a.user_detail.municipality || a.user_detail.landkreis || a.user_detail.assignedLocation || a.user_detail.federalState;
      const bScope = b.user_detail.municipality || b.user_detail.landkreis || b.user_detail.assignedLocation || b.user_detail.federalState;
      const aScopeId = aScope ? aScope.id : null;
      const bScopeId = bScope ? bScope.id : null;
      const aScopeName = aScope ? (aScope.title || "").toLowerCase() : "";
      const bScopeName = bScope ? (bScope.title || "").toLowerCase() : "";

      if (aScopeId === userScopeId && bScopeId !== userScopeId) {
        return -1; // Move a to a lower index
      } else if (aScopeId !== userScopeId && bScopeId === userScopeId) {
        return 1; // Move b to a lower index
      } else {
        // If scopes are the same or both are not equal to userScopeId, sort by scope name
        if (aScopeName < bScopeName) return -1;
        if (aScopeName > bScopeName) return 1;
        return 0; // If both scope IDs and names are the same or not applicable, maintain the current order
      }
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
    if (isLeaderInvite && !ctx.request.body.municipality) {
      return ctx.badRequest(t(ctx, "Ein*e Koordinator*in muss einer Verwaltung zugeordnet sein"));
    }
    if (!(await areLevelsConsistent(strapi, pickAssignedLevels(ctx.request.body)))) {
      return ctx.badRequest(t(ctx, "Die gewählten Ebenen passen nicht zusammen"));
    }
    try {
      if (isLeaderInvite) {
        const leaderExists = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            fields: ["username", "email"],
            filters: {
              role: { type: "leader" },
              user_detail: { municipality: ctx.request.body.municipality },
            },
          }
        );
        if (leaderExists && leaderExists.length > 0) {
          return ctx.badRequest(t(ctx, "Es kann nur eine*n Koordinator*in pro Verwaltung geben."));
        }
      }

      await strapi.controller("plugin::users-permissions.auth").register(ctx);
      const resetPasswordToken = crypto.randomBytes(64).toString("hex");
      await sendPwdInEmail(ctx, resetPasswordToken);
      var user_detail = await strapi.entityService.create(
        "api::user-detail.user-detail",
        {
          data: {
            invite: true,
            municipality: ctx.request.body.municipality,
            landkreis: ctx.request.body.landkreis,
            assignedLocation: ctx.request.body.assignedLocation,
            federalState: ctx.request.body.federalState,
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
        where: { email: ctx.request.body.email },
        data: qdata,
      });
    } catch (error) {
      return ctx.badRequest(error.message, error.details);
    }
  };
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

    ctx.request.body.data.role = { id: roles[ctx.request.body.data.role] };

    var role = ctx.request.body.data.role.id;

    const levels = pickAssignedLevels(ctx.request.body.data);
    if (role == roles.leader && !levels.municipalityId) {
      return ctx.badRequest(t(ctx, "Ein*e Koordinator*in muss einer Verwaltung zugeordnet sein"));
    }
    if (role != roles.admin && !Object.values(levels).some(Boolean)) {
      return ctx.badRequest(t(ctx, "Bitte weisen Sie dem Benutzer eine Verwaltungsebene zu"));
    }
    if (!(await areLevelsConsistent(strapi, levels))) {
      return ctx.badRequest(t(ctx, "Die gewählten Ebenen passen nicht zusammen"));
    }

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
    const payload = ctx;
    payload.state.user.id = ctx.params.id;
    payload.request.body.admin = true;
    const userDetail = await strapi.controller("api::user-detail.user-detail").getEntry(payload, false);
    // Every level the admin picked is kept, because a landkreis or municipality
    // can belong to several parents and only the stored choice says which one
    // this user is assigned to. Levels not sent are cleared.
    return await strapi.db.query("api::user-detail.user-detail").update({
      where: { id: userDetail[0].id },
      data: {
        federalState: levels.federalStateId,
        landkreis: levels.landkreisId,
        municipality: levels.municipalityId,
        assignedLocation: levels.locationId,
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
  async function _getUserScopeId(ctx) {
    const userDetails = await strapi.entityService.findOne(
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
              federalState: { fields: ["id"] },
            },
          },
        },
      }
    );
    const detail = userDetails.user_detail;
    return detail.municipality?.id ?? detail.landkreis?.id ?? detail.assignedLocation?.id ?? detail.federalState?.id;
  }
  return plugin;
};
