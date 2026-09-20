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
      }

      // Guests only ever pick a location (Ort) - derive the municipality
      // relation server-side from it instead of asking the guest to also
      // pick their administration (see the admin-hierarchy overhaul plan,
      // section 5).
      const assignedLocationId = ctx.request.body.data.assignedLocation?.id;
      if (assignedLocationId && !ctx.request.body.data.municipality) {
        const location = await strapi.entityService.findOne(
          "api::location.location",
          assignedLocationId,
          { populate: { municipality: { fields: ["id"] } } }
        );
        if (location?.municipality) {
          ctx.request.body.data.municipality = { id: location.municipality.id };
        }
      }

      return await super.create(ctx);
    },
  })
);
