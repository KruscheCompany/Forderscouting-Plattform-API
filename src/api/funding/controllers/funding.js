"use strict";

/**
 *  funding controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::funding.funding", ({ strapi }) => ({
  async find(ctx) {
    const options = this._buildGetFundingFilters(ctx);
    const entries = await strapi.entityService.findMany(
      "api::funding.funding",
      options
    );
    return entries;
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
    var entry = await strapi.entityService.findMany("api::funding.funding", {
      populate: {
        owner: { fields: ["username"] },
        editors: { fields: ["username"] },
        readers: { fields: ["username"] },
        categories: { fields: ["title"] },
        tags: { fields: ["title"] },
        info: "*",
        details: "*",
        rates: "*",
        links: "*",
        media: "*",
        files: "*",
        fundings: { fields: ["title"] },
        municipality: { fields: ["title", "location"] },
        fundingsLinkedTo: { fields: ["title"] },
        checklist: { fields: ["title"] },
        projects: { fields: ["title"] },
        projects: { fields: ["title"] },
        funding_comments: {
          fileds: ["comment"],
          populate: { owner: { fields: ["username"] } },
        },
      },
      filters,
    });
    if (entry.length == 0)
      return ctx.unauthorized(
        "Sie sind nicht berechtigt, diese Finanzierungsdetails einzusehen"
      );
    entry = entry[0];
    if (entry.owner.id == ctx.state.user.id) return this.getRequests(entry);
    else return entry;
  },
  async create(ctx) {
    ctx.request.body.data.owner = ctx.state.user;
    if (ctx.request.body.data.hasOwnProperty("checklist")) {
      const checkChecklist = await this.checkChecklist(
        ctx.request.body.data.checklist.id
      );
      if (checkChecklist == null || checkChecklist.funding != null)
        return ctx.badRequest(
          "Die von Ihnen ausgewählte Checkliste ist bereits mit einer Förderung verknüpft."
        );
    }
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
    if (ctx.state.user.role.type == "admin") delete filters.$or;
    var entry = await strapi.entityService.findMany("api::funding.funding", {
      populate: {
        owner: { fields: ["username"] },
      },
      filters,
    });
    if (entry.length == 0)
      return ctx.unauthorized(
        "Sie sind nicht berechtigt, diese Finanzierungsdetails zu bearbeiten"
      );
    else return await super.update(ctx);
  },
  async getRequests(entry) {
    const requests = await strapi.entityService.findMany(
      "api::request.request",
      {
        fields: ["approved"],
        filters: {
          approved: false,
          funding: { id: entry.id },
        },
        populate: {
          user: { fields: "username" },
          funding: { fields: ["title"] },
        },
      }
    );
    entry.requests = requests;
    return entry;
  },
  async checkChecklist(id) {
    const checklist = await strapi.entityService.findOne(
      "api::checklist.checklist",
      id,
      { populate: { funding: true } }
    );
    return checklist;
  },
  async count() {
    return await strapi.db.query("api::funding.funding").count({
      where: {
        archived: false,
      },
    });
  },
  async countArchived() {
    return await strapi.db.query("api::funding.funding").count({
      where: {
        archived: true,
      },
    });
  },
  async findArchived() {
    const entries = await strapi.entityService.findMany(
      "api::funding.funding",
      {
        fields: ["title", "plannedStart", "plannedEnd"],
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
  async getFundingExpirey(ctx) {
    var forUsers = new Date();
    var forAdmins = new Date();
    var today = new Date();
    forUsers.setDate(forUsers.getDate() + 180);
    forAdmins.setDate(forAdmins.getDate() + 30);

    var filters = {
      $and: [
        { plannedEnd: { $lte: forUsers.toISOString().split("T")[0] } },
        { plannedEnd: { $gte: today.toISOString().split("T")[0] } },
        { archived: false },
        { published: true },
        {
          projects: {
            owner: { id: ctx.state.user.id },
          },
        },
      ],
    };
    if (ctx.state.user.role.type == "admin") {
      filters.$and[0].plannedEnd = {
        $lte: forAdmins.toISOString().split("T")[0],
      };
      filters.$and.pop();
    }
    const entries = await strapi.entityService.findMany(
      "api::funding.funding",
      {
        fields: ["title", "plannedEnd"],
        filters,
        populate: {
          read_notifications: { populate: ["user"] },
        },
        sort: { plannedEnd: "ASC" },
      }
    );
    return entries;
  },
  async publicFind() {
    const entries = await strapi.entityService.findMany(
      "api::funding.funding",
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
  async hasEditRole(ctx) {
    const funding = await this.findOne(ctx);
    if (
      funding.editors.includes(ctx.state.user.id) ||
      funding.owner.id == ctx.state.user.id
    )
      return true;
    else return false;
  },
  _buildGetFundingFilters(ctx) {
    const { withArchived } = ctx.query;
    const getFundingFilters = {
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
      ],
    };
    const options = {
      fields: [
        "title",
        "visibility",
        "published",
        "plannedStart",
        "plannedEnd",
      ],
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
    };
    let newOptions = null;
    if (withArchived == "true") {
      newOptions = { fields: ["title", "archived"] }
      newOptions.populate = {
        categories: { fields: ["title"] },
        tags: { fields: ["title"] },
      };
      newOptions.filters = getFundingFilters;
      newOptions.filters.$and.push({
        $or: [{ archived: false }, { archived: true }],
      });
    } else {
      options.filters = getFundingFilters;
      options.filters.$and.push({
        archived: false,
      });
    }
    return newOptions || options;
  },

  // External AI/Vendor funding creation endpoint
  async createExternalFunding(ctx) {
    try {
      const { data } = ctx.request.body;

      // Query for admin users dynamically
      const adminUsers = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          fields: ["id", "username"],
          filters: {
            role: { type: "admin" }
          },
          populate: {
            role: { fields: ["type"] },
            user_detail: {
              populate: {
                municipality: { fields: ["id", "title"] }
              }
            }
          },
          sort: { id: "asc" } // Sort by ID for consistency
        }
      );

      // If no admin users found, throw an error
      if (!adminUsers || adminUsers.length === 0) {
        throw new Error("No admin users found in the system");
      }

      // Use the first admin user as the default owner
      const defaultAdmin = adminUsers[0];

      // Get all admin IDs for editors list
      const adminIds = adminUsers.map(admin => ({ id: admin.id }));

      // Get the municipality from the first admin user
      const defaultMunicipality = defaultAdmin.user_detail?.municipality;
      if (!defaultMunicipality) {
        throw new Error("Default admin user has no municipality assigned");
      }

      // Set default values for external funding creation
      const externalFundingData = {
        ...data,
        visibility: "only for me", // Default visibility for external funding
        owner: {
          id: defaultAdmin.id
        }, // Dynamic admin user as owner
        municipality: {
          id: defaultMunicipality.id
        }, // Dynamic municipality from first admin user
        published: true,
        tags: data.tags || [],
        categories: data.categories || [],
        editors: data.editors || adminIds, // All admin users as editors by default
        provider: data.provider || "external", // Default provider for external funding
        plannedEnd: data.plannedEnd || (() => {
          const oneYearFromNow = new Date();
          oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
          return oneYearFromNow.toISOString().split("T")[0];
        })(), // Default planned end date - one year from now
      };

      // Create the funding entry
      const entity = await strapi.entityService.create(
        "api::funding.funding",
        {
          data: externalFundingData,
        }
      );

      return entity;
    } catch (error) {
      strapi.log.error('External funding creation failed:', error);
      return ctx.badRequest('Failed to create external funding', { error: error.message });
    }
  },
}));
