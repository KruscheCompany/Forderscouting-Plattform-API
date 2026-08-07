"use strict";

/**
 * prioritized-project controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::prioritized-project.prioritized-project",
  ({ strapi }) => ({
    // Returns every municipality id the user is scoped to: their own
    // municipality, or (for a landkreis-level user) all municipalities
    // linked to their landkreis. Null if neither is set.
    async _getOwnMunicipalityScope(userId) {
      const userDetails = await strapi.entityService.findMany(
        "api::user-detail.user-detail",
        {
          filters: { user: { id: userId } },
          populate: {
            municipality: { fields: ["id"] },
            landkreis: { populate: { municipalities: { fields: ["id"] } } },
          },
        }
      );
      const detail = userDetails?.[0];
      if (detail?.municipality) return [detail.municipality.id];
      if (detail?.landkreis) {
        return (detail.landkreis.municipalities || []).map((m) => m.id);
      }
      return null;
    },

    // Write actions (create/delete/reorder) need exactly one municipality.
    // A landkreis leader spanning more than one municipality isn't
    // supported here yet (would need a municipality picker, same gap as
    // project creation) - treat as unscoped rather than guessing which one.
    async _getOwnMunicipalityId(userId) {
      const scopeIds = await this._getOwnMunicipalityScope(userId);
      return scopeIds && scopeIds.length === 1 ? scopeIds[0] : null;
    },

    async find(ctx) {
      const isAdmin = ctx.state.user.role.type === "admin";
      let municipalityIds;

      if (isAdmin) {
        const municipalityId = ctx.query.municipality;
        if (!municipalityId) {
          return ctx.badRequest(
            "Bitte wählen Sie eine Gemeinde aus, um die Priorisierung anzuzeigen."
          );
        }
        municipalityIds = [municipalityId];
      } else {
        municipalityIds = await this._getOwnMunicipalityScope(ctx.state.user.id);
        if (!municipalityIds || municipalityIds.length === 0) {
          return ctx.unauthorized(
            "Sie sind nicht berechtigt, die Priorisierung anzuzeigen. Keine Gemeinde zugewiesen."
          );
        }
      }

      return await strapi.entityService.findMany(
        "api::prioritized-project.prioritized-project",
        {
          filters: { municipality: { id: { $in: municipalityIds } } },
          sort: { position: "asc" },
          populate: {
            project: {
              fields: [
                "id",
                "title",
                "status",
                "updatedAt",
                "applicationProcessSteps",
                "fundingMatches",
              ],
            },
            prioritizedBy: {
              fields: ["username"],
              populate: { user_detail: { fields: ["fullName"] } },
            },
          },
        }
      );
    },

    async create(ctx) {
      if (ctx.state.user.role.type !== "leader") {
        return ctx.unauthorized(
          "Nur die Gemeindeleitung darf Projektideen priorisieren."
        );
      }

      const municipalityId = await this._getOwnMunicipalityId(ctx.state.user.id);
      if (!municipalityId) {
        return ctx.unauthorized(
          "Sie sind nicht berechtigt, Projektideen zu priorisieren. Keine Gemeinde zugewiesen."
        );
      }

      const projectId = ctx.request.body?.data?.project;
      if (!projectId) {
        return ctx.badRequest("Projekt-ID fehlt.");
      }

      const project = await strapi.entityService.findMany("api::project.project", {
        filters: { id: projectId, municipality: { id: municipalityId } },
        fields: ["id"],
      });
      if (project.length === 0) {
        return ctx.unauthorized(
          "Diese Projektidee gehört nicht zu Ihrer Gemeinde."
        );
      }

      const existing = await strapi.entityService.findMany(
        "api::prioritized-project.prioritized-project",
        { filters: { project: { id: projectId }, municipality: { id: municipalityId } } }
      );
      if (existing.length > 0) {
        return ctx.badRequest("Diese Projektidee ist bereits priorisiert.");
      }

      const currentEntries = await strapi.entityService.findMany(
        "api::prioritized-project.prioritized-project",
        { filters: { municipality: { id: municipalityId } }, fields: ["position"] }
      );
      const nextPosition =
        currentEntries.length === 0
          ? 0
          : Math.max(...currentEntries.map((e) => e.position || 0)) + 1;

      return await strapi.entityService.create(
        "api::prioritized-project.prioritized-project",
        {
          data: {
            project: projectId,
            municipality: municipalityId,
            prioritizedBy: ctx.state.user.id,
            position: nextPosition,
          },
        }
      );
    },

    async delete(ctx) {
      if (ctx.state.user.role.type !== "leader") {
        return ctx.unauthorized(
          "Nur die Gemeindeleitung darf Priorisierungen entfernen."
        );
      }

      const municipalityId = await this._getOwnMunicipalityId(ctx.state.user.id);
      if (!municipalityId) {
        return ctx.unauthorized(
          "Sie sind nicht berechtigt, Priorisierungen zu entfernen. Keine Gemeinde zugewiesen."
        );
      }

      const entry = await strapi.entityService.findMany(
        "api::prioritized-project.prioritized-project",
        { filters: { id: ctx.params.id, municipality: { id: municipalityId } } }
      );
      if (entry.length === 0) {
        return ctx.unauthorized(
          "Sie sind nicht berechtigt, diese Priorisierung zu entfernen."
        );
      }

      return await strapi.entityService.delete(
        "api::prioritized-project.prioritized-project",
        ctx.params.id
      );
    },

    async reorder(ctx) {
      if (ctx.state.user.role.type !== "leader") {
        return ctx.unauthorized(
          "Nur die Gemeindeleitung darf die Reihenfolge ändern."
        );
      }

      const municipalityId = await this._getOwnMunicipalityId(ctx.state.user.id);
      if (!municipalityId) {
        return ctx.unauthorized(
          "Sie sind nicht berechtigt, die Reihenfolge zu ändern. Keine Gemeinde zugewiesen."
        );
      }

      const order = ctx.request.body?.order;
      if (!Array.isArray(order) || order.length === 0) {
        return ctx.badRequest("Reihenfolge fehlt.");
      }

      const ownRows = await strapi.entityService.findMany(
        "api::prioritized-project.prioritized-project",
        { filters: { municipality: { id: municipalityId }, id: { $in: order } }, fields: ["id"] }
      );
      if (ownRows.length !== order.length) {
        return ctx.unauthorized(
          "Sie sind nicht berechtigt, diese Reihenfolge zu setzen."
        );
      }

      for (let i = 0; i < order.length; i++) {
        await strapi.entityService.update(
          "api::prioritized-project.prioritized-project",
          order[i],
          { data: { position: i } }
        );
      }

      return { success: true };
    },
  })
);
