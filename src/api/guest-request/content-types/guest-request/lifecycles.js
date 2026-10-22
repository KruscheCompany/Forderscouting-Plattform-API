const { emitToUser } = require("../../../../utils/socket");
const { buildEmailHtml, escapeHtml } = require("../../../../utils/email-template");

module.exports = {
  async afterCreate(event) {
    const { params } = event;
    const users = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        fields: ["username", "email"],
        populate: {
          role: { fields: ["type"] },
          user_detail: {
            populate: { notifications: { populate: { email: "*", app: "*" } } },
          },
        },
        filters: {
          role: { type: "admin" },
        },
      }
    );
    for (const user of users) {
      if (user.user_detail.notifications.email.userJoinRequest == true) {
        strapi.plugins["email"].services.email.send({
          to: user.email,
          from: process.env.DEF_FROM,
          replyTo: process.env.DEF_FROM,
          subject: `Ein neuer Antrag auf Teilnahme an der Plattform`,
          html: buildEmailHtml({
            greeting: user.username ? `Guten Tag ${escapeHtml(user.username)},` : undefined,
            bodyHtml: `<p style="margin-top: 0;">${escapeHtml(params.data.email)} bittet darum, der Plattform beizutreten.</p>`,
          }),
        });
      }
      if (user.user_detail.notifications.app.userJoinRequest == true) {
        emitToUser(user.id, "notification", { type: "guest" });
      }
    }

    // The request's own municipality is optional; guests are anchored on their Ort,
    // whose municipality is the one that counts.
    const locationId = params.data.assignedLocation?.id ?? params.data.assignedLocation;
    const location = !params.data.municipality?.id && locationId
      ? await strapi.entityService.findOne("api::location.location", locationId, {
          populate: { municipality: { fields: ["id"] } },
        })
      : null;
    const municipalityId = params.data.municipality?.id ?? location?.municipality?.id;
    if (!municipalityId) {
      strapi.log.warn(`guest-request: no municipality resolvable for ${params.data.email}, skipping leader notification`);
      return;
    }

    //find the municipality leader based on the municipality of the user who requested to join the platform and send an email
    const leader = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        fields: ["username", "email"],
        filters: {
          role: { type: "leader" },
          user_detail: {
            municipality: {
              id: municipalityId,
            },
          },
        },
        populate: {
          role: { fields: ["type"] },
          user_detail: {
            populate: {
              notifications: { populate: { email: "*", app: "*" } },
              municipality: true,
            },
          },
        },
      }
    );

    if (leader && leader.length > 0) {
      if (leader[0].user_detail.notifications.email.userJoinRequest == true) {
        strapi.plugins["email"].services.email.send({
          to: leader[0].email,
          from: process.env.DEF_FROM,
          replyTo: process.env.DEF_FROM,
          subject: `Ein neuer Antrag auf Teilnahme an der Plattform`,
          html: buildEmailHtml({
            greeting: leader[0].username ? `Guten Tag ${escapeHtml(leader[0].username)},` : undefined,
            bodyHtml: `<p style="margin-top: 0;">${escapeHtml(params.data.email)} bittet darum, der Plattform beizutreten.</p>`,
          }),
        });
      }
      if (leader[0].user_detail.notifications.app.userJoinRequest == true) {
        emitToUser(leader[0].id, "notification", { type: "guest" });
      }
    }
  },
};
