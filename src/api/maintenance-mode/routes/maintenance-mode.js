"use strict";

const { createCoreRouter } = require("@strapi/strapi").factories;

module.exports = createCoreRouter("api::maintenance-mode.maintenance-mode", {
  only: ["find", "update"],
});
