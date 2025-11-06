"use strict";

/**
 *  category controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::category.category",
  ({ strapi }) => ({
    async find(ctx) {
      if (!ctx.state.user) {
        const entries = await strapi.entityService.findMany(
          "api::category.category",
          filterObj
        );
        return entries;
      }
      const role = ctx.state.user.role.type;
      var filterObj = {
        fields: ["title"],
        populate: { projects: true, fundings: true },
      };
      if (role != "admin") delete filterObj.populate;
      const entries = await strapi.entityService.findMany(
        "api::category.category",
        filterObj
      );
      if (role === "admin")
        entries.forEach((entry) => {
          entry.dataSet = {};
          entry.dataSet.projects = entry.projects.length;
          entry.dataSet.fundings = entry.fundings.length;
          delete entry.projects;
          delete entry.fundings;
        });
      return entries;
    },

    /**
     * Simple find method that returns only id and title,
     * providing a lightweight endpoint for category selection interfaces.
     * @param {object} ctx - Strapi request context
     */
    async simpleFindCategories(ctx) {
      try {
        // Get basic sorting options from query
        const sort = ctx.query._sort || 'title:asc';

        // Set up the filter object
        var filterObj = {
          fields: ["id", "title"],
          sort: sort,
        };

        // If there are any specific filters in the query, apply them
        if (ctx.query.filters) {
          filterObj.filters = ctx.query.filters;
        }

        const entries = await strapi.entityService.findMany(
          "api::category.category",
          filterObj
        );

        return entries;
      } catch (error) {
        ctx.throw(500, error.message);
      }
    },
  })
);
