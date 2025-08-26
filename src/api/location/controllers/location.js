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
          populate: ["municipality"],
        }
      );
      return entities;
    },
  async findByMunicipality(ctx) {
    const isAdmin = ctx.state.user.role.type === 'admin';
    const { skipAdminPrivileges } = ctx.query;
    
    // Initialize filter with the title field selection
    const filters = {
      fields: ['title'],
    };
    
    // Get user's municipality - for all users
    const userDetails = await strapi.entityService.findMany(
      "api::user-detail.user-detail",
      {
        filters: { user: { id: ctx.state.user.id } },
        populate: { municipality: { fields: ["id"] } },
      }
    );
    
    // Check if the user has a municipality assigned
    if (!userDetails || userDetails.length === 0 || !userDetails[0].municipality) {
      return ctx.unauthorized(
        "Sie sind nicht berechtigt, auf diese Standorte zuzugreifen. Keine Gemeinde zugewiesen."
      );
    }
    
    // Get the user's municipality ID
    const userMunicipalityId = userDetails[0].municipality.id;
    
    // Apply municipality filter in these cases:
    // 1. User is not an admin (always filter by their municipality)
    // 2. User is admin AND skipAdminPrivileges=true (filter by admin's municipality)
    // Otherwise (admin without skipAdminPrivileges), no municipality filter is applied
    if (!isAdmin || (isAdmin && skipAdminPrivileges === 'true')) {
      filters.filters = {
        municipality: userMunicipalityId,
      };
    }
    
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
