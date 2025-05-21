const crypto = require("crypto");
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
    const userMunicipalityId = await _getUserMunicipalityId(ctx);
    const users = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        fields: ["username", "email"],
        populate: {
          role: { fields: ["type"] },
          user_detail: {
            fields: ["fullName"],
            populate: { municipality: { fields: ["title", "location"] } },
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
      const aMunicipality = a.user_detail.municipality.id;
      const bMunicipality = b.user_detail.municipality.id;
      const aMunicipalityName = a.user_detail.municipality.title.toLowerCase();
      const bMunicipalityName = b.user_detail.municipality.title.toLowerCase();

      if (
        aMunicipality === userMunicipalityId &&
        bMunicipality !== userMunicipalityId
      ) {
        return -1; // Move a to a lower index
      } else if (
        aMunicipality !== userMunicipalityId &&
        bMunicipality === userMunicipalityId
      ) {
        return 1; // Move b to a lower index
      } else {
        // If municipalities are the same or both are not equal to userMunicipalityId, sort by municipality name
        if (aMunicipalityName < bMunicipalityName) return -1;
        if (aMunicipalityName > bMunicipalityName) return 1;
        return 0; // If both municipality IDs and names are the same or not applicable, maintain the current order
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
    try {
      const leaderExists = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          fields: ["username", "email"],
          filters: {
            role: { type: "leader" },
            user_detail: {
              municipality: ctx.request.body.municipality,
            },
          },
          populate: {
            role: { fields: ["type"] },
            user_detail: {
              populate: {
                notifications: { populate: { email: "*" } },
                municipality: true,
              },
            },
          },
        }
      );

      if (
        leaderExists &&
        leaderExists.length > 0 &&
        ctx.request.body.role.id == roles.leader
      ) {
        return ctx.badRequest(
          "Es kann nur eine*n Koordinator*in pro Verwaltung geben."
        );
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
      // if (ctx.request.body.role == "admin") qdata.role = { id: 3 };
      if (ctx.request.body.role == "Admin") qdata.role = { id: roles.admin };
      if (ctx.request.body.role == "user") qdata.role = { id: roles.user };
      if (ctx.request.body.role == "Guest") qdata.role = { id: roles.guest };
      if (ctx.request.body.role == "Leader") qdata.role = { id: roles.leader };
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

    const leaderExists = await strapi.db
      .query("plugin::users-permissions.user")
      .findOne({
        populate: {
          role: true,
          user_detail: true,
        },
        where: {
          role: { id: roles.leader },
          user_detail: { municipality: ctx.request.body.data.municipality.id },
        },
      });

    //If updating user is leader
    if (leaderExists && leaderExists.email == ctx.request.body.data.email) {
      console.log("leaderExists");
      const user = await strapi
        .service("plugin::users-permissions.user")
        .edit(ctx.params.id, ctx.request.body.data);
      const payload = ctx;
      payload.state.user.id = ctx.params.id;
      payload.request.body.admin = true;
      const userDetail = await strapi
        .controller("api::user-detail.user-detail")
        .getEntry(payload, false);
      const entry = await strapi.db
        .query("api::user-detail.user-detail")
        .update({
          where: { id: userDetail[0].id },
          data: {
            municipality: ctx.request.body.data.municipality.id,
          },
        });
      return entry;
    } else {
      //If there is no leader for this municipality
      if (!leaderExists) {
        const user = await strapi
          .service("plugin::users-permissions.user")
          .edit(ctx.params.id, ctx.request.body.data);
        const payload = ctx;
        payload.state.user.id = ctx.params.id;
        payload.request.body.admin = true;
        const userDetail = await strapi
          .controller("api::user-detail.user-detail")
          .getEntry(payload, false);
        const entry = await strapi.db
          .query("api::user-detail.user-detail")
          .update({
            where: { id: userDetail[0].id },
            data: {
              municipality: ctx.request.body.data.municipality.id,
            },
          });
        return entry;
      } else {
        //If there is a leader for this municipality and updating user is not leader
        if (
          leaderExists &&
          leaderExists.email != ctx.request.body.data.email &&
          role != roles.leader
        ) {
          const user = await strapi
            .service("plugin::users-permissions.user")
            .edit(ctx.params.id, ctx.request.body.data);
          const payload = ctx;
          payload.state.user.id = ctx.params.id;
          payload.request.body.admin = true;
          const userDetail = await strapi
            .controller("api::user-detail.user-detail")
            .getEntry(payload, false);
          const entry = await strapi.db
            .query("api::user-detail.user-detail")
            .update({
              where: { id: userDetail[0].id },
              data: {
                municipality: ctx.request.body.data.municipality.id,
              },
            });
          return entry;
        } else {
          return ctx.badRequest(
            "Es kann nur eine*n Koordinator*in pro Verwaltung geben."
          );
        }
      }
    }

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
      return ctx.badRequest(
        "Sie können kein anderes Konto als Ihr eigenes löschen."
      );
    }
    let res = await strapi
      .controller("api::user-detail.user-detail")
      .countAndGetTransferableData({
        state: { user: { id: ctx.request.params.id } },
      });
    if (
      res.project.length > 0 ||
      res.funding.length > 0 ||
      res.checklist.length > 0
    )
      return ctx.badRequest(
        "Mit diesem Konto sind Daten verknüpft. Übertragen Sie diese Daten zuerst."
      );
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
      html:
        ctx.request.body.message +
        "<br/><p>" +
        process.env.RESET_PWD_PAGE +
        resetPasswordToken +
        "</p>",
    });
  }
  async function _getUserMunicipalityId(ctx) {
    const userDetails = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      ctx.state.user.id,
      {
        fields: ["id"],
        populate: {
          user_detail: {
            populate: { municipality: { fields: ["id"] } },
          },
        },
      }
    );
    return userDetails.user_detail.municipality.id;
  }
  return plugin;
};
