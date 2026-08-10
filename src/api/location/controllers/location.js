const { t } = require("../../../utils/i18n");
'use strict';

/**
 * location controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::location.location', ({ strapi }) => ({
  async find(ctx) {
      const entities = await strapi.entityService.findMany(
        "api::location.location",
        {
          populate: ["municipality","federalStates"],
        }
      );
      return entities;
    },
  async findByMunicipality(ctx) {
    const isAdmin = ctx.state.user.role.type === 'admin';
    const { municipalityId } = ctx.query;

    // Initialize filter with the title field selection
    const filters = {
      fields: ['title'],
    };

    // Get user's municipality/landkreis scope - for all users
    const userDetails = await strapi.entityService.findMany(
      "api::user-detail.user-detail",
      {
        filters: { user: { id: ctx.state.user.id } },
        populate: {
          municipality: { fields: ["id"] },
          landkreis: { populate: { municipalities: { fields: ["id"] } } },
        },
      }
    );

    const detail = userDetails?.[0];
    const userMunicipalityIds = detail?.municipality
      ? [detail.municipality.id]
      : detail?.landkreis
        ? (detail.landkreis.municipalities || []).map((m) => m.id)
        : [];

    // Check if the user has a municipality/landkreis assigned
    if (!isAdmin && userMunicipalityIds.length === 0) {
      return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, auf diese Standorte zuzugreifen. Keine Gemeinde zugewiesen."));
    }

    // Apply municipality filter based on user role and parameters:
    // 1. For non-admin users: Always filter by their municipality/landkreis's municipalities
    // 2. For admin users:
    //    a. If municipalityId is provided (can be comma-separated for multiple), filter by those municipalities
    //    b. Otherwise, return all locations (no filter)
    if (!isAdmin) {
      // Non-admin users always get filtered by their municipality/landkreis scope
      filters.filters = {
        municipality: { id: { $in: userMunicipalityIds } },
      };
    } else if (municipalityId) {
      // Admin with specified municipalityId(s)
      if (municipalityId.includes(',')) {
        // Multiple municipality IDs provided as comma-separated values
        const municipalityIds = municipalityId.split(',').filter(Boolean);

        filters.filters = {
          municipality: {
            id: {
              $in: municipalityIds
            }
          }
        };
      } else {
        // Single municipality ID
        filters.filters = {
          municipality: municipalityId,
        };
      }
    }
    // If admin without municipalityId, no filter is applied - returning all locations

    const locations = await strapi.entityService.findMany('api::location.location',
      filters);
    return locations;
  },

  async findGroupedByMunicipality(ctx) {
    const filters = {
      fields: ['title'],
      populate: { municipality: { fields: ['title'] } },
    };
    const locations = await strapi.entityService.findMany('api::location.location',
      filters);
    const groupedLocations = locations.reduce((acc, location) => {
      if (!acc[location.municipality.title]) {
        acc[location.municipality.title] = [];
      }
      acc[location.municipality.title].push(location.title);
      return acc;
    }, {});

    // Sort the locations alphabetically within each municipality
    Object.keys(groupedLocations).forEach(municipality => {
      groupedLocations[municipality].sort((a, b) => a.localeCompare(b));
    });

    return groupedLocations;
  }
}));
