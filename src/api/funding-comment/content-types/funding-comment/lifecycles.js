const { emitToUser } = require("../../../../utils/socket");
const { buildEmailHtml, escapeHtml } = require("../../../../utils/email-template");

module.exports = {
  async afterCreate(event) {
    const { params } = event;
    const document = await strapi.entityService.findOne(
      `api::funding.funding`,
      params.data.funding,
      {
        fields: ["title"],
      }
    );
    const userRequesting = await strapi
      .controller("api::user-detail.user-detail")
      .find({ state: { user: { id: params.data.owner } } });
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
          subject: `Ein neuer Kommentar zu einer Fördermittel hinzugefügt`,
          html: buildEmailHtml({
            greeting: user.username ? `Guten Tag ${escapeHtml(user.username)},` : undefined,
            bodyHtml: `<p style="margin-top: 0;">${escapeHtml(userRequesting.fullName)} hat den folgenden Kommentar zur Fördermittel hinzugefügt: ${escapeHtml(document.title)}</p><p><strong>Kommentar:</strong><br />${escapeHtml(params.data.comment)}</p>`,
          }),
        });
      }
      if (user.user_detail.notifications.app.fundingComments == true) {
        emitToUser(user.id, "notification", { type: "fundingComments" });
      }
    }
  },
};
