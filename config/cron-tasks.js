const { buildVorpruefungEmail } = require("../src/api/vorpruefung-ticket/email.js");
const { emitToUser } = require("../src/utils/socket");
const { buildEmailHtml, escapeHtml } = require("../src/utils/email-template");

module.exports = {
  "0 0 1 * * *": ({ strapi }) => {
    var today = new Date();
    strapi.db.query("api::funding.funding").updateMany({
      where: {
        published: true,
        archived: false,
        fundingOpen: { $ne: true },
        plannedEnd: { $lte: today.toISOString().split("T")[0] },
      },
      data: {
        archived: true,
      },
    });
    async function getFundingExpirey() {
      //email if the funding is about to expire in 180 days for admins, in 30 days for users
      var forUsers = new Date();
      var forAdmins = new Date();
      var today = new Date();
      forUsers.setDate(forUsers.getDate() + 180);
      forAdmins.setDate(forAdmins.getDate() + 30);

      const fundingsForUsers = await strapi.entityService.findMany(
        "api::funding.funding",
        {
          fields: ["title", "plannedEnd"],
          filters: {
            plannedEnd: { $eq: forUsers.toISOString().split("T")[0] },
            archived: false,
            published: true,
            fundingOpen: { $ne: true },
          },
          populate: {
            projects: {
              fields: ["title"],
              populate: {
                owner: {
                  fields: ["username", "email"],
                  populate: {
                    user_detail: {
                      populate: { notifications: { populate: { email: "*", app: "*" } } },
                    },
                  },
                },
              },
            },
          },
          sort: { plannedEnd: "ASC" },
        }
      );
      const fundingsForAdmins = await strapi.entityService.findMany(
        "api::funding.funding",
        {
          fields: ["title", "plannedEnd"],
          filters: {
            plannedEnd: { $eq: forAdmins.toISOString().split("T")[0] },
            archived: false,
            published: true,
            fundingOpen: { $ne: true },
          },
          sort: { plannedEnd: "ASC" },
        }
      );
      sendToAdmins(fundingsForAdmins);
      sendToUsers(fundingsForUsers);
    }
    async function sendToAdmins(fundings) {
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
      for (const funding of fundings) {
        for (const user of users) {
          if (user.user_detail.notifications.email.fundingExpiry == true) {
            await strapi.plugins["email"].services.email.send({
              to: user.email,
              from: process.env.DEF_FROM,
              replyTo: process.env.DEF_FROM,
              subject: `Die Fördermittel ${funding.title} läuft demnächst aus`,
              html: buildEmailHtml({
                greeting: user.username ? `Guten Tag ${escapeHtml(user.username)},` : undefined,
                bodyHtml: `<p style="margin-top: 0;">Als Administrator werden Sie darüber informiert, dass in 30 Tagen die Fördermittel "${escapeHtml(funding.title)}" ausläuft.</p>`,
              }),
            });
          }
          if (user.user_detail.notifications.app.fundingExpiry == true) {
            emitToUser(user.id, "notification", { type: "fundingExpirey" });
          }
        }
      }
    }
    async function sendToUsers(fundings) {
      for (const funding of fundings) {
        for (const project of funding.projects) {
          const user = project.owner;
          if (user.user_detail.notifications.email.fundingExpiry == true) {
            await strapi.plugins["email"].services.email.send({
              to: user.email,
              from: process.env.DEF_FROM,
              replyTo: process.env.DEF_FROM,
              subject: `Die Fördermittel ${funding.title} läuft demnächst aus`,
              html: buildEmailHtml({
                greeting: user.username ? `Guten Tag ${escapeHtml(user.username)},` : undefined,
                bodyHtml: `<p style="margin-top: 0;">Als Nutzer werden Sie darüber informiert, dass in 180 Tagen die Fördermittel "${escapeHtml(funding.title)}" abläuft. Für Ihr Projekt "${escapeHtml(project.title)}"</p>`,
              }),
            });
          }
          if (user.user_detail.notifications.app.fundingExpiry == true) {
            emitToUser(user.id, "notification", { type: "fundingExpirey" });
          }
        }
      }
    }
    getFundingExpirey().catch((err) => strapi.log.error("getFundingExpirey failed", err));
    async function sendVorpruefungReminders() {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);

      const dueTickets = await strapi.entityService.findMany(
        "api::vorpruefung-ticket.vorpruefung-ticket",
        {
          filters: {
            answeredAt: { $null: true },
            reminderSentAt: { $null: true },
            sentAt: { $lte: cutoff.toISOString() },
          },
          populate: {
            project: {
              fields: ["title"],
              populate: { fundingGuideline: { fields: ["title"] } },
            },
          },
        }
      );

      for (const ticket of dueTickets) {
        if (!ticket.reviewerContact || !ticket.token) continue;
        const { subject, html } = buildVorpruefungEmail({
          projectTitle: ticket.project.title,
          guidelineName: ticket.project.fundingGuideline?.[0]?.title || null,
          type: ticket.type,
          token: ticket.token,
          variant: "reminder",
          firstName: ticket.reviewerFirstName,
          lastName: ticket.reviewerLastName,
        });

        await strapi.plugins["email"].services.email.send({
          to: ticket.reviewerContact,
          from: process.env.DEF_FROM,
          replyTo: process.env.DEF_FROM,
          subject,
          html,
        });
        await strapi.entityService.update(
          "api::vorpruefung-ticket.vorpruefung-ticket",
          ticket.id,
          { data: { reminderSentAt: new Date() } }
        );
      }
    }
    sendVorpruefungReminders().catch((err) => strapi.log.error("sendVorpruefungReminders failed", err));
  },
};
