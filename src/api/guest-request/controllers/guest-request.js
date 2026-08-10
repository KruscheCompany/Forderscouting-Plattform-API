"use strict";

/**
 *  guest-request controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const { t } = require("../../../utils/i18n");

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
          t(ctx, "A request to join the platform with email {email} already exists.", {
            email: ctx.request.body.data.email,
          })
        );
      } else return await super.create(ctx);
    },
  })
);
