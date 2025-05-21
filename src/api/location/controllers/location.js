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
    const { id } = ctx.params;
    const filters = {
      fields: ['title'],
    };
    if (!isAdmin) {
      filters.filters = {
        municipality: id,
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
