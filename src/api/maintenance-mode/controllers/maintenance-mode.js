"use strict";

const { t } = require("../../../utils/i18n");
const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::maintenance-mode.maintenance-mode",
  ({ strapi }) => ({
    async update(ctx) {
      if (!ctx.state.user || ctx.state.user.role.type !== "admin") {
        return ctx.unauthorized(
          t(ctx, "Nur Administrator*innen können den Wartungsmodus ändern.")
        );
      }
      return super.update(ctx);
    },
  })
);
