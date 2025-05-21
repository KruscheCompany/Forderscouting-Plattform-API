"use strict";

/**
 *  project controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::project.project", ({ strapi }) => ({
  async find(ctx) {
    if (ctx.state.user.role.type != "guest") {
      const entries = await strapi.entityService.findMany(
        "api::project.project",
        {
          fields: [
            "title",
            "visibility",
            "published",
            "plannedStart",
            "plannedEnd",
          ],
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
            municipality: { fields: ["title", "id"] },
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
        "api::project.project",
        {
          fields: [
            "title",
            "visibility",
            "published",
            "plannedStart",
            "plannedEnd",
          ],
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
                info: { location: userLocation },
              },
            ],
          },
          populate: {
            owner: {
              fields: ["username"],
              populate: {
                user_detail: {
                  fields: ["fullName", "location"],
                  populate: {
                    municipality: { fields: ["title"] },
                  },
                },
              },
            },
            categories: { fields: ["title"] },
            editors: { fields: ["username"] },
            readers: { fields: ["username"] },
            tags: { fields: ["title"] },
            municipality: { fields: ["title", "id"] },
            info: "*",
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
      filters = { id: ctx.params.id }
    }

    var entry = await strapi.entityService.findMany("api::project.project", {
      populate: {
        owner: { fields: ["username"], populate: { user_detail: "*" } },
        editors: { fields: ["username"] },
        readers: { fields: ["username"] },
        categories: { fields: ["title"] },
        tags: { fields: ["title"] },
        info: "*",
        details: "*",
        estimatedCosts: "*",
        links: "*",
        media: "*",
        files: "*",
        fundingGuideline: { fields: ["title"] },
        checklists: { fields: ["title"] },
        municipality: { fields: ["title", "location"] },
      },
      filters,
    });
    if (entry.length == 0)
      return ctx.unauthorized(
        "Sie sind nicht berechtigt, diese Projektdetails anzuzeigen"
      );
    entry = entry[0];
    const count = await strapi.db.query("api::project.project").count({
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
  async create(ctx) {
    ctx.request.body.data.owner = ctx.state.user;
    let entity = await super.create(ctx);
    return entity;
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
    if (ctx.state.user.role.type == "admin") filters = { id: ctx.params.id };
    var entry = await strapi.entityService.findMany("api::project.project", {
      populate: {
        owner: { fields: ["username"] },
      },
      filters,
    });
    if (entry.length == 0)
      return ctx.unauthorized(
        "Sie sind nicht berechtigt, diese Projektdetails zu bearbeiten"
      );
    else return await super.update(ctx);
  },
  async delete(ctx) {
    if (ctx.state.user.role.type == "admin") return await super.delete(ctx);
    var entry = await strapi.entityService.findMany("api::project.project", {
      populate: {
        owner: { fields: ["username"] },
      },
      filters: {
        owner: { id: ctx.state.user.id },
        id: ctx.params.id,
      },
    });
    if (entry.length == 0)
      return ctx.unauthorized(
        "Sie sind nicht berechtigt, dieses Projekt zu löschen"
      );
    else return await super.delete(ctx);
  },
  async getRequests(entry) {
    const requests = await strapi.entityService.findMany(
      "api::request.request",
      {
        fields: ["approved"],
        filters: {
          approved: false,
          project: { id: entry.id },
        },
        populate: {
          user: { fields: "username" },
          project: { fields: ["title"] },
        },
      }
    );
    entry.requests = requests;
    return entry;
  },
  async count() {
    return await strapi.db.query("api::project.project").count({
      where: {
        archived: false,
      },
    });
  },
  async countArchived() {
    return await strapi.db.query("api::project.project").count({
      where: {
        archived: true,
      },
    });
  },
  async findArchived() {
    const entries = await strapi.entityService.findMany(
      "api::project.project",
      {
        fields: ["title", "plannedStart", "plannedEnd"],
        filters: {
          archived: true,
        },
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
      }
    );
    return entries;
  },
  async publicFind() {
    const entries = await strapi.entityService.findMany(
      "api::project.project",
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
  async duplicateProjectFromRequest(ctx, payload) {
    var ctxlikeObj = {
      state: JSON.parse(JSON.stringify(ctx.state)),
      params: JSON.parse(JSON.stringify(ctx.params)),
    };
    ctxlikeObj.params.id = payload.project.id;
    var project = await this.findOne(ctxlikeObj);
    payload.project = project;
    await this.duplicateProject(ctx, payload);
  },
  //dups a project if visibility is set to "all users" or is owner
  async duplicateProjectDirectly(ctx) {
    var userInfo = await strapi
      .controller("api::user-detail.user-detail")
      .find(ctx);
    var payload = {
      user: {
        id: ctx.state.user.id,
        user_detail: userInfo,
      },
    };
    var project = await this.findOne(ctx);
    payload.project = project;
    if (
      project.visibility == "all users" ||
      project.owner.id == ctx.state.user.id
    )
      return await this.duplicateProject(ctx, payload);
    else
      return ctx.unauthorized("Sie können diese Projektidee nicht duplizieren");
  },
  async duplicateProject(ctx, payload) {
    var project = payload.project;
    var projectID = payload.project.id;
    project.title =
      `[Duplikat][${payload.user.user_detail.fullName}] ` + project.title;
    project.published = false;
    project.visibility = "only for me";
    project.archived = false;
    project.owner = payload.user.id;
    project.municipality = payload.user.user_detail.municipality.id;
    var keys = [
      "createdAt",
      "updatedAt",
      "editors",
      "readers",
      "media",
      "files",
      "id",
      "requests",
    ];
    var except = ["categories", "tags", "fundingGuideline", "checklists"];
    var project = await this.filterObject(project, keys, except);
    project.dupFrom = { id: projectID };
    try {
      return await strapi.entityService.create("api::project.project", {
        data: project,
      });
    } catch (e) {
      return ctx.badRequest(e);
    }
  },
  async totalDuplications() {
    return await strapi.db.query("api::project.project").count({
      where: {
        dupFrom: {
          id: {
            $notNull: true,
          },
        },
      },
    });
  },
  async filterObject(obj, keys, except) {
    for (var i in obj) {
      if (!obj.hasOwnProperty(i) || except.includes(i)) continue;
      if (
        obj[i] != null &&
        typeof obj[i] == "object" &&
        !Array.isArray(obj[i])
      ) {
        await this.filterObject(obj[i], keys, except);
      } else if (keys.includes(i) || obj[i] == null) {
        delete obj[i];
      } else if (Array.isArray(obj[i])) {
        for (const ele of obj[i]) {
          await this.filterObject(ele, keys, except);
        }
      }
    }
    return obj;
  },
  async hasEditRole(ctx) {
    const project = await this.findOne(ctx);
    if (
      project.editors.includes(ctx.state.user.id) ||
      project.owner.id == ctx.state.user.id
    )
      return true;
    else return false;
  },
}));
