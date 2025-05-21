"use strict";

/**
 *  checklist controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::checklist.checklist",
  ({ strapi }) => ({
    async create(ctx) {
      ctx.request.body.data.owner = ctx.state.user;
      let entity = await super.create(ctx);
      return entity;
    },
    async find(ctx) {
      if (ctx.state.user.role.type != "guest") {
        const entries = await strapi.entityService.findMany(
          "api::checklist.checklist",
          {
            fields: ["title", "visibility", "published", "ideaProvider"],
            populate: {
              owner: {
                fields: ["username"],
                populate: {
                  user_detail: {
                    fields: ["fullName"],
                    populate: { municipality: { fields: ["title"] } },
                  },
                },
              },
              categories: { fields: ["title"] },
              tags: { fields: ["title"] },
              editors: { fields: ["username"] },
              readers: { fields: ["username"] },
              municipality: { fields: ["title", "id"] },
            },
            filters: {
              $or: [
                {
                  owner: { id: ctx.state.user.id },
                },
                {
                  editors: { id: ctx.state.user.id },
                },
                {
                  readers: { id: ctx.state.user.id },
                },
                {
                  visibility: "listed only",
                },
                {
                  visibility: "all users",
                },
              ],
              $and: [
                {
                  $or: [
                    {
                      published: true,
                    },
                    {
                      $and: [
                        {
                          published: false,
                        },
                        {
                          owner: { id: ctx.state.user.id },
                        },
                      ],
                    },
                  ],
                },
                {
                  archived: false,
                },
              ],
            },
          }
        );
        return entries;
      } else {
        // find the current user location in user-detail
        var userLocation = await strapi.entityService.findMany(
          "api::user-detail.user-detail",
          {
            filters: {
              user: { id: ctx.state.user.id },
            },
            populate: {
              municipality: { fields: ["title", "id"] },
            },
          }
        );
        userLocation = userLocation[0].location;

        const entries = await strapi.entityService.findMany(
          "api::checklist.checklist",
          {
            fields: ["title", "visibility", "published", "ideaProvider"],
            populate: {
              owner: {
                fields: ["username"],
                populate: {
                  user_detail: {
                    fields: ["fullName"],
                    populate: {
                      municipality: { fields: ["title"] },
                    },
                  },
                },
              },
              categories: { fields: ["title"] },
              tags: { fields: ["title"] },
              editors: { fields: ["username"] },
              readers: { fields: ["username"] },
              municipality: { fields: ["title", "id"] },
              info: "*",
            },
            filters: {
              $or: [
                {
                  owner: { id: ctx.state.user.id },
                },
                {
                  editors: { id: ctx.state.user.id },
                },
                {
                  readers: { id: ctx.state.user.id },
                },
                {
                  visibility: "listed only",
                },
                {
                  visibility: "all users",
                },
              ],
              $and: [
                {
                  $or: [
                    {
                      published: true,
                    },
                    {
                      $and: [
                        {
                          published: false,
                        },
                        {
                          owner: { id: ctx.state.user.id },
                        },
                      ],
                    },
                  ],
                },
                {
                  archived: false,
                },
                {
                  info: {
                    location: userLocation,
                  },
                },
              ],
            },
          }
        );
        return entries;
      }
    },
    async findOne(ctx) {
      let filters = {
        // (owner == user|| editors == user || readers == user || visibility == "all users") && (published == true || published == false && owner==user)
        $or: [
          {
            owner: { id: ctx.state.user.id },
          },
          {
            editors: { id: ctx.state.user.id },
          },
          {
            readers: { id: ctx.state.user.id },
          },
          {
            visibility: "all users",
          },
        ],
        $and: [
          {
            $or: [
              {
                published: true,
              },
              {
                $and: [
                  {
                    published: false,
                  },
                  {
                    owner: { id: ctx.state.user.id },
                  },
                ],
              },
            ],
          },
          {
            archived: false,
          },
        ],
        id: ctx.params.id,
      };
      if (ctx.state.user.role.type == "admin") {
        delete filters.$or;
        delete filters.$and;
      }
      var entry = await strapi.entityService.findMany(
        "api::checklist.checklist",
        {
          populate: {
            owner: { fields: ["username"], populate: { user_detail: "*" } },
            editors: { fields: ["username"] },
            readers: { fields: ["username"] },
            categories: { fields: ["title"] },
            media: "*",
            tags: { fields: ["title"] },
            info: "*",
            funding: { fields: ["title"] },
            municipality: { fields: ["title", "location"] },
            project: { fields: ["title"] },
            initialContact: {
              populate: {
                captureIdea: { populate: "*" },
                caputreContect: { populate: "*" },
              },
            },
            preparation: {
              populate: {
                inspection: { populate: "*" },
                captureRequirements: { populate: "*" },
                captureNeeds: { populate: "*" },
              },
            },
            fundingResearch: {
              populate: {
                checkDatabase: { populate: "*" },
                checkForFunding: { populate: "*" },
                checkWithFunding: { populate: "*" },
                checkGuildlines: { populate: "*" },
                selectFunding: { populate: "*" },
              },
            },
            preparationOfProject: {
              populate: {
                checkContent: { populate: "*" },
                checkCooperations: { populate: "*" },
                checkSimilarProejcts: { populate: "*" },
                checkPlanning: { populate: "*" },
              },
            },
            legitimation: {
              populate: {
                template: { populate: "*" },
              },
            },
            finalExamination: {
              populate: {
                revision: { populate: "*" },
                signatures: { populate: "*" },
              },
            },
          },
          filters,
        }
      );
      if (entry.length == 0)
        return ctx.unauthorized(
          "Sie sind nicht berechtigt, die Details dieser Checkliste anzuzeigen"
        );
      entry = entry[0];
      const count = await strapi.db.query("api::checklist.checklist").count({
        where: {
          dupFrom: entry.id,
        },
      });
      entry.duplications = count;
      var contactInfo = await strapi
        .controller("api::user-detail.user-detail")
        .getContactPersonInfo(ctx, entry.owner.user_detail.id);
      contactInfo.location = entry.info.location;
      entry.info = contactInfo;
      if (entry.owner.id == ctx.state.user.id) return this.getRequests(entry);
      else return entry;
    },
    async update(ctx) {
      delete ctx.request.body.data.owner;
      let filters = {
        $or: [
          {
            owner: { id: ctx.state.user.id },
          },
          {
            editors: { id: ctx.state.user.id },
          },
        ],
        id: ctx.params.id,
      };
      if (ctx.state.user.role.type == "admin") delete filters.$or;
      var entry = await strapi.entityService.findMany(
        "api::checklist.checklist",
        {
          populate: {
            owner: { fields: ["username"] },
          },
          filters,
        }
      );
      if (entry.length == 0)
        return ctx.unauthorized(
          "Sie sind nicht berechtigt, diese Checklistendetails zu bearbeiten"
        );
      else return await super.update(ctx);
    },
    async delete(ctx) {
      if (ctx.state.user.role.type == "admin") return await super.delete(ctx);
      var entry = await strapi.entityService.findMany(
        "api::checklist.checklist",
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
        return ctx.unauthorized("Sie dürfen diese Checkliste nicht löschen");
      else return await super.delete(ctx);
    },
    async getRequests(entry) {
      const requests = await strapi.entityService.findMany(
        "api::request.request",
        {
          fields: ["approved"],
          filters: {
            approved: false,
            checklist: { id: entry.id },
          },
          populate: {
            user: { fields: "username" },
            checklist: { fields: ["title"] },
          },
        }
      );
      entry.requests = requests;
      return entry;
    },
    async count() {
      return await strapi.db.query("api::checklist.checklist").count({
        where: {
          archived: false,
        },
      });
    },
    async findArchived() {
      const entries = await strapi.entityService.findMany(
        "api::checklist.checklist",
        {
          fields: ["title"],
          populate: {
            owner: {
              fields: ["username"],
              populate: {
                user_detail: {
                  fields: ["fullName"],
                  populate: { municipality: { fields: ["title"] } },
                },
              },
            },
            categories: { fields: ["title"] },
            editors: { fields: ["username"] },
            readers: { fields: ["username"] },
            tags: { fields: ["title"] },
          },
          filters: {
            archived: true,
          },
        }
      );
      return entries;
    },
    async countArchived() {
      return await strapi.db.query("api::checklist.checklist").count({
        where: {
          archived: true,
        },
      });
    },
    async publicFind() {
      const entries = await strapi.entityService.findMany(
        "api::checklist.checklist",
        {
          fields: ["title"],
          filters: {
            $or: [
              {
                visibility: "all users",
              },
              {
                visibility: "listed only",
              },
            ],
            published: true,
            archived: false,
          },
          populate: {
            categories: { fields: ["title"] },
          },
        }
      );
      return entries;
    },
    async duplicateChecklistFromRequest(ctx, payload) {
      var ctxlikeObj = {
        state: JSON.parse(JSON.stringify(ctx.state)),
        params: JSON.parse(JSON.stringify(ctx.params)),
      };
      ctxlikeObj.params.id = payload.checklist.id;
      var checklist = await this.findOne(ctxlikeObj);
      payload.checklist = checklist;
      await this.duplicateChecklist(ctx, payload);
    },
    //dups a checklist if visibility is set to "all users" or is owner
    async duplicateChecklistDirectly(ctx) {
      var userInfo = await strapi
        .controller("api::user-detail.user-detail")
        .find(ctx);
      var payload = {
        user: {
          id: ctx.state.user.id,
          user_detail: userInfo,
        },
      };
      var checklist = await this.findOne(ctx);
      payload.checklist = checklist;
      if (
        checklist.visibility == "all users" ||
        checklist.owner.id == ctx.state.user.id
      )
        return await this.duplicateChecklist(ctx, payload);
      else
        return ctx.unauthorized(
          "Sie können diese Durchführungs-Checkliste nicht duplizieren"
        );
    },
    async duplicateChecklist(ctx, payload) {
      var checklist = payload.checklist;
      var checklistID = payload.checklist.id;
      checklist.title =
        `[Duplikat][${payload.user.user_detail.fullName}] ` + checklist.title;
      checklist.published = false;
      checklist.visibility = "only for me";
      checklist.archived = false;
      checklist.owner = payload.user.id;
      checklist.municipality = payload.user.user_detail.municipality.id;
      var keys = [
        "createdAt",
        "updatedAt",
        "editors",
        "readers",
        "media",
        "files",
        "file",
        "id",
        "requests",
      ];
      var except = ["categories", "tags", "fundings", "project", "funding"];
      checklist = await strapi
        .controller("api::project.project")
        .filterObject(checklist, keys, except);
      checklist.dupFrom = { id: checklistID };
      try {
        return await strapi.entityService.create("api::checklist.checklist", {
          data: checklist,
        });
      } catch (e) {
        return ctx.badRequest(e);
      }
    },
    async totalDuplications() {
      return await strapi.db.query("api::checklist.checklist").count({
        where: {
          dupFrom: {
            id: {
              $notNull: true,
            },
          },
        },
      });
    },
    async hasEditRole(ctx) {
      const checklist = await this.findOne(ctx);
      if (
        checklist.editors.includes(ctx.state.user.id) ||
        checklist.owner.id == ctx.state.user.id
      )
        return true;
      else return false;
    },
  })
);
