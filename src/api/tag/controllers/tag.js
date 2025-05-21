"use strict";

/**
 *  tag controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::tag.tag", ({ strapi }) => ({
  async find(ctx) {
    const role = ctx.state.user.role.type;
    var filterObj = {
      fields: ["title"],
      populate: { projects: true, fundings: true, checklists: true },
    };
    if (role != "admin") delete filterObj.populate;
    const entries = await strapi.entityService.findMany(
      "api::tag.tag",
      filterObj
    );
    if (role === "admin")
      entries.forEach((entry) => {
        entry.dataSet = {};
        entry.dataSet.projects = entry.projects.length;
        entry.dataSet.fundings = entry.fundings.length;
        entry.dataSet.checklist = entry.checklists.length;
        delete entry.projects;
        delete entry.fundings;
        delete entry.checklists;
      });
    return entries;
  },
}));
