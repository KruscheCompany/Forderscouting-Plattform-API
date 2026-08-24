const { emitToUser } = require("../../../../utils/socket");
const { buildEmailHtml, escapeHtml } = require("../../../../utils/email-template");

module.exports = {
  async afterCreate(event) {
    const { params } = event;

    var type = null;
    if (params.data.hasOwnProperty("project")) type = "project";
    else if (params.data.hasOwnProperty("funding")) type = "funding";

    const document = await strapi.entityService.findOne(
      `api::${type}.${type}`,
      params.data[type].id,
      {
        fields: ["title"],
        populate: {
          owner: {
            fields: ["username", "email"],
            populate: {
              user_detail: {
                populate: {
                  notifications: { populate: { email: "*", app: "*" } },
                  municipality: true,
                  landkreis: true,
                },
              },
            },
          },
        },
      }
    );

    if (params.data.guest == true) {
      const ownerDetail = document.owner.user_detail;
      const scopeFilter = ownerDetail.municipality
        ? { municipality: { id: ownerDetail.municipality.id } }
        : ownerDetail.landkreis
          ? { landkreis: { id: ownerDetail.landkreis.id } }
          : null;

      const leader = scopeFilter
        ? await strapi.entityService.findMany(
            "plugin::users-permissions.user",
            {
              fields: ["username", "email"],
              populate: {
                role: { fields: ["type"] },
                user_detail: {
                  populate: {
                    notifications: { populate: { email: "*", app: "*" } },
                    municipality: true,
                    landkreis: true,
                  },
                },
              },
              filters: {
                role: { type: "leader" },
                user_detail: scopeFilter,
              },
            }
          )
        : [];

      if (leader.length > 0) {
        const userRequesting = await strapi
          .controller("api::user-detail.user-detail")
          .find({ state: { user: { id: params.data.user.id } } });
        await strapi.plugins["email"].services.email.send({
          to: leader[0].email,
          from: process.env.DEF_FROM,
          replyTo: process.env.DEF_FROM,
          subject: `Neuer Antrag an ${params.data.type} ${type}: ${document.title}`,
          html: buildEmailHtml({
            greeting: leader[0].username ? `Guten Tag ${escapeHtml(leader[0].username)},` : undefined,
            bodyHtml: `<p style="margin-top: 0;">${escapeHtml(userRequesting.fullName)} bittet um ${escapeHtml(params.data.type)} Ihr ${escapeHtml(type)}: ${escapeHtml(document.title)}</p>`,
          }),
        });
        if (leader[0].user_detail.notifications.app.dataRequests == true) {
          emitToUser(leader[0].id, "notification", { type: "requests" });
        }
      }
    } else {
      const userRequesting = await strapi
        .controller("api::user-detail.user-detail")
        .find({ state: { user: { id: params.data.user.id } } });
      if (document.owner.user_detail.notifications.email.dataRequests == true) {
        await strapi.plugins["email"].services.email.send({
          to: document.owner.email,
          from: process.env.DEF_FROM,
          replyTo: process.env.DEF_FROM,
          subject: `Neuer Antrag an ${params.data.type} ${type}: ${document.title}`,
          html: buildEmailHtml({
            greeting: document.owner.username ? `Guten Tag ${escapeHtml(document.owner.username)},` : undefined,
            bodyHtml: `<p style="margin-top: 0;">${escapeHtml(userRequesting.fullName)} bittet um ${escapeHtml(params.data.type)} Ihr ${escapeHtml(type)}: ${escapeHtml(document.title)}</p>`,
          }),
        });
      }
      if (document.owner.user_detail.notifications.app.dataRequests == true) {
        emitToUser(document.owner.id, "notification", { type: "requests" });
      }
    }
  },
  async afterUpdate(event) {
    const { result } = event;
    if (
      result.guest == true &&
      result.leaderApproved == true &&
      result.approved == false
    ) {
      const request = await strapi.entityService.findOne(
        "api::request.request",
        result.id,
        {
          populate: {
            user: true,
            funding: {
              fields: ["title"],
              populate: {
                owner: {
                  fields: ["username", "email"],
                  populate: {
                    user_detail: {
                      populate: {
                        notifications: { populate: { email: "*", app: "*" } },
                      },
                    },
                  },
                },
              },
            },
            project: {
              fields: ["title"],
              populate: {
                owner: {
                  fields: ["username", "email"],
                  populate: {
                    user_detail: {
                      populate: {
                        notifications: { populate: { email: "*", app: "*" } },
                      },
                    },
                  },
                },
              },
            },
          },
        }
      );

      const document = request.funding || request.project;
      if (document.owner.user_detail.notifications.email.dataRequests == true) {
        await strapi.plugins["email"].services.email.send({
          to: document.owner.email,
          from: process.env.DEF_FROM,
          replyTo: process.env.DEF_FROM,
          subject: `Neuer Antrag auf Zugang zu einem Dokument: "${document.title}"`,
          html: buildEmailHtml({
            greeting: document.owner.username ? `Guten Tag ${escapeHtml(document.owner.username)},` : undefined,
            bodyHtml: `<p style="margin-top: 0;">${escapeHtml(request.user.username)} hat den Zugriff beantragt auf: ${escapeHtml(document.title)}</p>`,
          }),
        });
      }
      if (document.owner.user_detail.notifications.app.dataRequests == true) {
        emitToUser(document.owner.id, "notification", { type: "requests" });
      }

      if (request && request.user && request.user.email) {
        await strapi.plugins["email"].services.email.send({
          to: request.user.email,
          from: process.env.DEF_FROM,
          replyTo: process.env.DEF_FROM,
          subject: `Dokumentantrag angenommen`,
          html: buildEmailHtml({
            greeting: request.user.username ? `Guten Tag ${escapeHtml(request.user.username)},` : undefined,
            bodyHtml: `<p style="margin-top: 0;">Der Koordinator*in der Gemeinde hat Ihren Antrag auf Zugang zum Dokument "${escapeHtml(document.title)}" angenommen.</p>`,
          }),
        });
        emitToUser(request.user.id, "notification", { type: "requests" });
      }
    }
  },
};
