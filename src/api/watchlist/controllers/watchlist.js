"use strict";

/**
 *  watchlist controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::watchlist.watchlist",
  ({ strapi }) => ({
    async create(ctx) {
      ctx.request.body.data.owner = ctx.state.user;
      const body = ctx.request.body.data;
      var exist = false;
      if (body.hasOwnProperty("project"))
        exist = await this.checkIfExists(ctx, {
          filters: {
            owner: { id: ctx.state.user.id },
            project: { id: body.project },
          },
        });
      else if (body.hasOwnProperty("funding"))
        exist = await this.checkIfExists(ctx, {
          filters: {
            owner: { id: ctx.state.user.id },
            funding: { id: body.funding },
          },
        });
      else if (body.hasOwnProperty("checklist"))
        exist = await this.checkIfExists(ctx, {
          filters: {
            owner: { id: ctx.state.user.id },
            checklist: { id: body.checklist },
          },
        });
      if (exist)
        return ctx.badRequest(
          "Sie haben diesen Artikel bereits in Ihrer Merkliste."
        );
      else return await super.create(ctx);
    },
    async find(ctx) {
      const entries = await strapi.entityService.findMany(
        "api::watchlist.watchlist",
        {
          filters: {
            owner: { id: ctx.state.user.id },
            $or: [
              {
                funding: {
                  archived: false,
                },
              },
              {
                project: {
                  archived: false,
                },
              },
              {
                checklist: {
                  archived: false,
                },
              },
            ],
          },
          populate: {
            owner: { fields: ["username"] },
            project: {
              fields: [
                "title",
                "visibility",
                "published",
                "plannedStart",
                "plannedEnd",
              ],
              populate: {
                owner: { fields: ["username"] },
                categories: { fields: ["title"] },
                editors: { fields: ["username"] },
                readers: { fields: ["username"] },
              },
            },
            funding: {
              fields: ["title", "plannedStart", "plannedEnd", "visibility"],
              populate: {
                owner: { fields: ["username"] },
                categories: { fields: ["title"] },
                editors: { fields: ["username"] },
                readers: { fields: ["username"] },
              },
            },
            checklist: {
              fields: ["title", "visibility"],
              populate: {
                owner: { fields: ["username"] },
                categories: { fields: ["title"] },
                editors: { fields: ["username"] },
                readers: { fields: ["username"] },
              },
            },
          },
        }
      );
      entries.forEach((entry) => {
        //add type = project to all entries in entry.projects
        entry.project == null
          ? delete entry.project
          : (entry.project.type = "project");
        //add type = checklist to all entries in entry.checklist
        entry.checklist == null
          ? delete entry.checklist
          : (entry.checklist.type = "Implementation Checklist");

        //add type = funding to all entries in entry.funding
        entry.funding == null
          ? delete entry.funding
          : (entry.funding.type = "Funding");
      });

      return entries;
    },
    async delete(ctx) {
      var entry = await strapi.entityService.findMany(
        "api::watchlist.watchlist",
        {
          populate: {
            owner: { fields: ["username"] },
          },
          filters: {
            owner: { id: ctx.state.user.id },
            id: ctx.params.id,
          },
        }
      );
      if (entry.length == 0)
        return ctx.unauthorized("Sie dürfen diese Merkliste nicht löschen.");
      else return await super.delete(ctx);
    },
    async checkIfExists(ctx, filters) {
      const entries = await strapi.entityService.findMany(
        "api::watchlist.watchlist",
        filters
      );
      return entries.length > 0;
    },
    async count() {
      return await strapi.db.query("api::watchlist.watchlist").count();
    },
  })
);
