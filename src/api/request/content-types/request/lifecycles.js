module.exports = {
  async afterCreate(event) {
    const { params } = event;

    var type = null;
    if (params.data.hasOwnProperty("project")) type = "project";
    else if (params.data.hasOwnProperty("funding")) type = "funding";
    else if (params.data.hasOwnProperty("checklist")) type = "checklist";

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
                  notifications: { populate: { email: "*" } },
                  municipality: true,
                },
              },
            },
          },
        },
      }
    );

    if (params.data.guest == true) {
      const leader = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          fields: ["username", "email"],
          populate: {
            role: { fields: ["type"] },
            user_detail: {
              populate: {
                notifications: { populate: { email: "*" } },
                municipality: true,
              },
            },
          },
          filters: {
            role: { type: "leader" },
            user_detail: {
              municipality: {
                id: document.owner.user_detail.municipality.id,
              },
            },
          },
        }
      );

      if (leader) {
        const userRequesting = await strapi
          .controller("api::user-detail.user-detail")
          .find({ state: { user: { id: params.data.user.id } } });
        await strapi.plugins["email"].services.email.send({
          to: leader[0].email,
          from: process.env.DEF_FROM,
          replyTo: process.env.DEF_FROM,
          subject: `Neuer Antrag an ${params.data.type} ${type}: ${document.title}`,
          html: `${userRequesting.fullName} bittet um ${params.data.type} Ihr ${type}: ${document.title} `,
        });
      }
    } else {
      if (document.owner.user_detail.notifications.email.dataRequests == true) {
        const userRequesting = await strapi
          .controller("api::user-detail.user-detail")
          .find({ state: { user: { id: params.data.user.id } } });
        await strapi.plugins["email"].services.email.send({
          to: document.owner.email,
          from: process.env.DEF_FROM,
          replyTo: process.env.DEF_FROM,
          subject: `Neuer Antrag an ${params.data.type} ${type}: ${document.title}`,
          html: `${userRequesting.fullName} bittet um ${params.data.type} Ihr ${type}: ${document.title} `,
        });
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
                        notifications: { populate: { email: "*" } },
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
                        notifications: { populate: { email: "*" } },
                      },
                    },
                  },
                },
              },
            },
            checklist: {
              fields: ["title"],
              populate: {
                owner: {
                  fields: ["username", "email"],
                  populate: {
                    user_detail: {
                      populate: {
                        notifications: { populate: { email: "*" } },
                      },
                    },
                  },
                },
              },
            },
          },
        }
      );

      const document = request.funding || request.project || request.checklist;
      if (document.owner.user_detail.notifications.email.dataRequests == true) {
        await strapi.plugins["email"].services.email.send({
          to: document.owner.email,
          from: process.env.DEF_FROM,
          replyTo: process.env.DEF_FROM,
          subject: `Neuer Antrag auf Zugang zu einem Dokument: "${document.title}"`,
          html: `${request.user.username} hat den Zugriff beantragt auf: ${document.title} `,
        });
      }

      if (request && request.user && request.user.email) {
        await strapi.plugins["email"].services.email.send({
          to: request.user.email,
          from: process.env.DEF_FROM,
          replyTo: process.env.DEF_FROM,
          subject: `Dokumentantrag angenommen`,
          html: `Der Koordinator*in der Gemeinde hat Ihren Antrag auf Zugang zum Dokument "${document.title}" angenommen.`,
        });
      }
    }
  },
};
