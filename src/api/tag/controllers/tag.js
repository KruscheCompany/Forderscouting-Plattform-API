"use strict";

const { t } = require("../../../utils/i18n");

/**
 *  tag controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::tag.tag", ({ strapi }) => ({
  async find(ctx) {
    const role = ctx.state.user.role.type;
    var filterObj = {
      fields: ["title", "status"],
      populate: { projects: true, fundings: true },
      filters: { status: role === "admin" ? ctx.query.status || "approved" : "approved" },
    };
    if (role != "admin") delete filterObj.populate;
    const entries = await strapi.entityService.findMany(
      "api::tag.tag",
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
   * Any authenticated user can submit an AI-generated tag suggestion.
   * It is always created with status "pending" regardless of who calls it,
   * and only becomes usable elsewhere once an admin approves it via update().
   */
  async suggestCreateTag(ctx) {
    try {
      const title = (ctx.request.body && ctx.request.body.title || "").trim();
      if (!title) {
        return ctx.badRequest(t(ctx, "Title is required"));
      }

      const existing = await strapi.entityService.findMany("api::tag.tag", {
        filters: { title: { $eqi: title } },
        fields: ["id", "title", "status"],
      });
      if (existing && existing.length > 0) {
        return existing[0];
      }

      try {
        const created = await strapi.entityService.create("api::tag.tag", {
          data: { title, status: "pending" },
        });
        return created;
      } catch (createError) {
        // Two requests can both pass the lookup above before either insert lands
        // (title is DB-unique) - fall back to the row the other request just created.
        const raced = await strapi.entityService.findMany("api::tag.tag", {
          filters: { title: { $eqi: title } },
          fields: ["id", "title", "status"],
        });
        if (raced && raced.length > 0) {
          return raced[0];
        }
        throw createError;
      }
    } catch (error) {
      strapi.log.error("suggestCreateTag error", error);
      ctx.throw(500, t(ctx, "An internal error occurred. Please try again later."));
    }
  },

  /**
   * Proxy for AI taxonomy suggestions: forwards free-text content to the
   * external AI vendor and returns its suggested/generated tags & categories.
   * Endpoint: POST {AI_ENDPOINT}/taxonomy/suggest
   */
  async proxySuggestTaxonomy(ctx) {
    const axios = require("axios");

    try {
      const target = process.env.AI_ENDPOINT;
      const apiKey = process.env.AI_ENDPOINT_KEY;
      if (!target || !apiKey) {
        strapi.log.error("AI_ENDPOINT or AI_ENDPOINT_KEY not configured for proxySuggestTaxonomy");
        return ctx.internalServerError("External taxonomy API not configured");
      }

      const payload = ctx.request.body || {};
      const { content, maxSuggestions, maxGenerated } = payload;
      if (!content) {
        return ctx.badRequest(t(ctx, "Content is required"));
      }

      const url = `${target.replace(/\/$/, "")}/taxonomy/suggest`;

      strapi.log.info("Proxying taxonomy suggest request to external AI API", { url });

      const resp = await axios.post(url, { content, maxSuggestions, maxGenerated }, {
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        timeout: 60000,
        validateStatus: (s) => s < 600,
      });

      if (resp.status >= 400) {
        strapi.log.error("External taxonomy API returned error", { status: resp.status, data: resp.data });
        ctx.status = resp.status;
        ctx.body = { error: "External taxonomy API error", details: resp.data };
        return;
      }

      ctx.status = resp.status;
      ctx.body = resp.data;
    } catch (err) {
      if (err.code === "ECONNREFUSED") {
        strapi.log.error("proxySuggestTaxonomy connection refused", err.message);
        return ctx.serviceUnavailable("External taxonomy API unavailable");
      }
      if (err.code === "ETIMEDOUT" || err.code === "ECONNABORTED") {
        strapi.log.error("proxySuggestTaxonomy timeout", err.message);
        return ctx.requestTimeout("External taxonomy API timed out");
      }
      if (err.response) {
        strapi.log.error("proxySuggestTaxonomy external response error", { status: err.response.status, data: err.response.data });
        ctx.status = err.response.status;
        ctx.body = { error: "External taxonomy API error", details: err.response.data };
        return;
      }

      strapi.log.error("proxySuggestTaxonomy unexpected error", err.stack || err.message);
      return ctx.internalServerError("Failed to proxy taxonomy suggest request");
    }
  },

  /**
   * Simple find method that returns only id and title,
   * providing a lightweight endpoint for tag selection interfaces.
   * @param {object} ctx - Strapi request context
   */
  async simpleFindTags(ctx) {
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
        "api::tag.tag",
        filterObj
      );

      return entries;
    } catch (error) {
      strapi.log.error(error);
      ctx.throw(500, t(ctx, "An internal error occurred. Please try again later."));
    }
  },
}));
