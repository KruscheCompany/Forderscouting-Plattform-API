"use strict";

const { t } = require("../../../utils/i18n");
const { buildEmailHtml, escapeHtml } = require("../../../utils/email-template");
/**
 *  request controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::request.request", ({ strapi }) => ({
  async create(ctx) {
    const exists = await strapi.entityService.findMany("api::request.request", {
      filters: {
        ...ctx.request.body.data,
      },
    });
    if (exists.length > 0) {
      ctx.throw(
        400,
        t(ctx, "Request to {type} this document already exists.", {
          type: ctx.request.body.data.type,
        })
      );
    } else return await super.create(ctx);
  },
  async update(ctx) {
    if (ctx.state.user.role.type == "leader") {
      if (ctx.request.body.data.approved == true) {
        ctx.request.body.data.leaderApproved = true;
        ctx.request.body.data.approved = false;
        return await super.update(ctx);
      } else {
        const response = await super.delete(ctx);
        return response;
      }
    } else {
      const request = await strapi.entityService.findMany(
        "api::request.request",
        {
          fields: ["approved", "type"],
          filters: {
            approved: false,
            id: ctx.params.id,
            $or: [
              {
                project: {
                  owner: ctx.state.user.id,
                },
              },
              {
                funding: {
                  owner: ctx.state.user.id,
                },
              },
            ],
          },
          populate: {
            user: {
              fields: ["username", "email", "id"],
              populate: {
                user_detail: {
                  fields: ["fullName"],
                  populate: {
                    municipality: { fields: ["title", "id"] },
                    landkreis: { fields: ["title", "id"] },
                  },
                },
                role: { fields: ["type"] },
              },
            },
            funding: { fields: ["title"] },
            project: { fields: ["title"] },
          },
        }
      );

      const requesterDetail = request[0].user.user_detail;
      const scopeFilter = requesterDetail.municipality
        ? { municipality: { id: requesterDetail.municipality.id } }
        : { landkreis: { id: requesterDetail.landkreis.id } };

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
                landkreis: true,
              },
            },
          },
          filters: {
            role: { type: "leader" },
            user_detail: scopeFilter,
          },
        }
      );

      // return request;
      if (request.length > 0) {
        if (
          request[0].funding != null &&
          ctx.request.body.data.approved == true
        )
          this.acceptFunding(ctx, request[0], leader);
        else if (
          request[0].project != null &&
          ctx.request.body.data.approved == true
        )
          this.acceptProject(ctx, request[0], leader);
        const response = await super.delete(ctx);
        return response;
      } else
        return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, diese Anfrage anzunehmen."));
    }
  },

  async acceptFunding(ctx, request, leader) {
    if (request.type == "edit")
      await strapi.db.connection.context.raw(
        `INSERT INTO fundings_editors_links VALUES (${request.funding.id}, ${request.user.id});`
      );
    else if (request.type == "view")
      await strapi.db.connection.context.raw(
        `INSERT INTO fundings_readers_links VALUES (${request.funding.id}, ${request.user.id});`
      );

    if (
      request &&
      request.user &&
      request.user.role.type == "guest" &&
      request.user.email
    ) {
      await strapi.plugins["email"].services.email.send({
        to: request.user.email,
        from: process.env.DEF_FROM,
        replyTo: process.env.DEF_FROM,
        subject: `Dokumentantrag angenommen`,
        html: buildEmailHtml({
          greeting: request.user.username ? `Guten Tag ${escapeHtml(request.user.username)},` : undefined,
          bodyHtml: `<p style="margin-top: 0;">Der Eigentümer des Dokuments "${escapeHtml(request.funding.title)}" hat Ihren Antrag auf Zugriff auf das Dokument angenommen. Sie haben jetzt Zugang.</p>`,
        }),
      });
    }
  },
  async acceptProject(ctx, request, leader) {
    if (request.type == "edit")
      await strapi.db.connection.context.raw(
        `INSERT INTO projects_editors_links VALUES (${request.project.id}, ${request.user.id});`
      );
    else if (request.type == "view")
      await strapi.db.connection.context.raw(
        `INSERT INTO projects_readers_links VALUES (${request.project.id}, ${request.user.id});`
      );
    else if (request.type == "duplicate") {
      try {
        await strapi
          .controller("api::project.project")
          .duplicateProjectFromRequest(ctx, request);
      } catch (e) {
        return ctx.badRequest(e);
      }
    }

    if (
      request &&
      request.user &&
      request.user.role.type == "guest" &&
      request.user.email
    ) {
      await strapi.plugins["email"].services.email.send({
        to: request.user.email,
        from: process.env.DEF_FROM,
        replyTo: process.env.DEF_FROM,
        subject: `Dokumentantrag angenommen`,
        html: buildEmailHtml({
          greeting: request.user.username ? `Guten Tag ${escapeHtml(request.user.username)},` : undefined,
          bodyHtml: `<p style="margin-top: 0;">Der Eigentümer des Dokuments "${escapeHtml(request.project.title)}" hat Ihren Antrag auf Zugriff auf das Dokument angenommen. Sie haben jetzt Zugang.</p>`,
        }),
      });
    }

    if (leader) {
      await strapi.plugins["email"].services.email.send({
        to: leader[0].email,
        from: process.env.DEF_FROM,
        replyTo: process.env.DEF_FROM,
        subject: `Der Antrag auf Zugriff auf ${request.project.title} wurde angenommen.`,
        html: buildEmailHtml({
          greeting: leader[0].username ? `Guten Tag ${escapeHtml(leader[0].username)},` : undefined,
          bodyHtml: `<p style="margin-top: 0;">Der Antrag auf Zugriff auf den ${escapeHtml(request.project.title)} durch den ${escapeHtml(request.user.username)} wurde vom Eigentümer des Dokuments angenommen.</p>`,
        }),
      });
    }
  },
}));
