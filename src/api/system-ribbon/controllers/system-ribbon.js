"use strict";

const { t } = require("../../../utils/i18n");
const { createCoreController } = require("@strapi/strapi").factories;

function hasUnsafeLinkUrl(ctx) {
  const linkUrl = ctx.request.body && ctx.request.body.data && ctx.request.body.data.linkUrl;
  if (!linkUrl) return false;
  try {
    const protocol = new URL(linkUrl).protocol;
    return protocol !== "http:" && protocol !== "https:";
  } catch (e) {
    return true;
  }
}

module.exports = createCoreController(
  "api::system-ribbon.system-ribbon",
  ({ strapi }) => ({
    async create(ctx) {
      if (!ctx.state.user || ctx.state.user.role.type !== "admin") {
        return ctx.unauthorized(t(ctx, "Nur Administrator*innen können einen Systemhinweis veröffentlichen."));
      }
      if (hasUnsafeLinkUrl(ctx)) {
        return ctx.badRequest(t(ctx, "linkUrl muss eine http(s)-URL sein."));
      }
      return super.create(ctx);
    },
    async update(ctx) {
      if (!ctx.state.user || ctx.state.user.role.type !== "admin") {
        return ctx.unauthorized(t(ctx, "Nur Administrator*innen können einen Systemhinweis zurückziehen."));
      }
      if (hasUnsafeLinkUrl(ctx)) {
        return ctx.badRequest(t(ctx, "linkUrl muss eine http(s)-URL sein."));
      }
      return super.update(ctx);
    },
    async active(ctx) {
      const [ribbon] = await strapi.entityService.findMany(
        "api::system-ribbon.system-ribbon",
        {
          fields: ["message", "linkLabel", "linkUrl"],
          filters: { active: true },
          sort: { createdAt: "desc" },
          limit: 1,
        }
      );
      ctx.body = ribbon || null;
    },
  })
);
