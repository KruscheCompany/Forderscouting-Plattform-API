"use strict";

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
        `Request to ${ctx.request.body.data.type} this document already exists.`
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
              {
                checklist: {
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
                  populate: { municipality: { fields: ["title", "id"] } },
                },
                role: { fields: ["type"] },
              },
            },
            funding: { fields: ["title"] },
            project: { fields: ["title"] },
            checklist: { fields: ["title"] },
          },
        }
      );

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
                id: request[0].user.user_detail.municipality.id,
              },
            },
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
        else if (
          request[0].checklist != null &&
          ctx.request.body.data.approved == true
        )
          this.acceptChecklist(ctx, request[0], leader);
        const response = await super.delete(ctx);
        return response;
      } else
        return ctx.unauthorized(
          `Sie sind nicht berechtigt, diese Anfrage anzunehmen.`
        );
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
        html: `Der Eigentümer des Dokuments "${request.funding.title}" hat Ihren Antrag auf Zugriff auf das Dokument angenommen. Sie haben jetzt Zugang.`,
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
        html: `Der Eigentümer des Dokuments "${request.project.title}" hat Ihren Antrag auf Zugriff auf das Dokument angenommen. Sie haben jetzt Zugang.`,
      });
    }

    if (leader) {
      await strapi.plugins["email"].services.email.send({
        to: leader[0].email,
        from: process.env.DEF_FROM,
        replyTo: process.env.DEF_FROM,
        subject: `Der Antrag auf Zugriff auf ${request.project.title} wurde angenommen.`,
        html: `Der Antrag auf Zugriff auf den ${request.project.title} durch den ${request.user.username} wurde vom Eigentümer des Dokuments angenommen.`,
      });
    }
  },
  async acceptChecklist(ctx, request, leader) {
    if (request.type == "edit")
      await strapi.db.connection.context.raw(
        `INSERT INTO checklists_editors_links VALUES (${request.checklist.id}, ${request.user.id});`
      );
    else if (request.type == "view")
      await strapi.db.connection.context.raw(
        `INSERT INTO checklists_readers_links VALUES (${request.checklist.id}, ${request.user.id});`
      );
    else if (request.type == "duplicate") {
      try {
        await strapi
          .controller("api::checklist.checklist")
          .duplicateChecklistFromRequest(ctx, request);
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
        html: `Der Eigentümer des Dokuments "${request.checklist.title}" hat Ihren Antrag auf Zugriff auf das Dokument angenommen. Sie haben jetzt Zugang.`,
      });
    }

    if (leader) {
      await strapi.plugins["email"].services.email.send({
        to: leader[0].email,
        from: process.env.DEF_FROM,
        replyTo: process.env.DEF_FROM,
        subject: `Der Antrag auf Zugriff auf ${request.checklist.title} wurde angenommen.`,
        html: `Der Antrag auf Zugriff auf den ${request.checklist.title} durch den ${request.user.username} wurde vom Eigentümer des Dokuments angenommen.`,
      });
    }
  },
}));
