"use strict";

const { t } = require("../../../utils/i18n");
/**
 *  landkreis controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::landkreis.landkreis",
  ({ strapi }) => ({
    async delete(ctx) {
      const { id } = ctx.params;
      const entries = await strapi.entityService.findMany(
        "api::landkreis.landkreis",
        {
          filters: {
            id,
          },
          fields: ["title"],
          populate: { user_details: true },
        }
      );
      if (entries.length == 0) return ctx.badRequest(t(ctx, "Kein Landkreis gefunden"));
      else if (entries[0].user_details.length > 0)
        return ctx.unauthorized(t(ctx, "Kann nicht löschen. Es gibt Benutzer, die mit diesem Landkreis verbunden sind."));
      else return super.delete(ctx);
    },
  })
);
