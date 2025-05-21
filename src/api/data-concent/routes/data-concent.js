"use strict";

/**
 * data-concent router.
 */

const { createCoreRouter } = require("@strapi/strapi").factories;

module.exports = createCoreRouter("api::data-concent.data-concent", {
  config: {
    findOne: {
      middlewares: ["plugin::users-permissions.rateLimit"],
    },
    update: {
      middlewares: ["plugin::users-permissions.rateLimit"],
    },
  },
});
