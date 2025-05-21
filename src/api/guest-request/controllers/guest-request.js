"use strict";

/**
 *  guest-request controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::guest-request.guest-request",
  ({ strapi }) => ({
    async create(ctx) {
      const exists = await strapi.entityService.findMany(
        "api::guest-request.guest-request",
        {
          filters: {
            ...ctx.request.body.data,
          },
        }
      );
      if (exists.length > 0) {
        ctx.throw(
          400,
          `A request to join the platoform with email ${ctx.request.body.data.email} already exists.`
        );
      } else return await super.create(ctx);
    },
  })
);
