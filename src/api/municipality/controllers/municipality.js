"use strict";

/**
 *  municipality controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::municipality.municipality",
  ({ strapi }) => ({
    async find(ctx) {
      const role = ctx.state.user.role.type;
      var filterObj = {
        fields: ["title", "location"],
        populate: {
          projects: {
            fields: ["title", "visibility"],
            populate: {
              owner: { fields: ["username"] },
              categories: { fields: ["title"] },
              editors: { fields: ["username"] },
              readers: { fields: ["username"] },
            },
            filters: {
              $or: [
                {
                  owner: { id: ctx.state.user.id },
                },
                {
                  editors: { id: ctx.state.user.id },
                },
                {
                  readers: { id: ctx.state.user.id },
                },
                {
                  visibility: "listed only",
                },
                {
                  visibility: "all users",
                },
              ],
              $and: [
                {
                  $or: [
                    {
                      published: true,
                    },
                    {
                      $and: [
                        {
                          published: false,
                        },
                        {
                          owner: { id: ctx.state.user.id },
                        },
                      ],
                    },
                  ],
                },
                {
                  archived: false,
                },
              ],
            },
          },
          checklists: {
            fields: ["title", "visibility"],
            populate: {
              owner: { fields: ["username"] },
              categories: { fields: ["title"] },
              editors: { fields: ["username"] },
              readers: { fields: ["username"] },
            },
            filters: {
              $or: [
                {
                  owner: { id: ctx.state.user.id },
                },
                {
                  editors: { id: ctx.state.user.id },
                },
                {
                  readers: { id: ctx.state.user.id },
                },
                {
                  visibility: "listed only",
                },
                {
                  visibility: "all users",
                },
              ],
              $and: [
                {
                  $or: [
                    {
                      published: true,
                    },
                    {
                      $and: [
                        {
                          published: false,
                        },
                        {
                          owner: { id: ctx.state.user.id },
                        },
                      ],
                    },
                  ],
                },
                {
                  archived: false,
                },
              ],
            },
          },
          user_details: {
            populate: {
              user: {
                populate: {
                  role: {
                    fields: ["type"],
                  },
              } },
            },
          },
          profile: true,
        },
      };
      const entries = await strapi.entityService.findMany(
        "api::municipality.municipality",
        filterObj
      );
      entries.forEach((entry) => {
        entry.dataSet = {};
        entry.users = "";
        entry.guests = "";
        entry.dataSet.projects = entry.projects.length;
        entry.dataSet.checklist = entry.checklists.length;
        entry.dataSet.total = entry.dataSet.projects + entry.dataSet.checklist;
        //get users name in a string and remove excess data
        if (entry.user_details.length > 0) {
          entry.user_details.forEach((userDetails) => {
            if (userDetails.user.role.type === "guest")
              entry.guests += userDetails.fullName + ", ";
            else
              entry.users += userDetails.fullName + ", ";
          });
          entry.users = entry.users.slice(0, -2);
          entry.guests = entry.guests.slice(0, -2);
        }
        //add type = project to all entries in entry.projects
        entry.projects.forEach((project) => {
          project.type = "project";
        });
        //add type = checklist to all entries in entry.checklist
        entry.checklists.forEach((checklist) => {
          checklist.type = "Implementation Checklist";
        });
        entry.data = [...entry.projects, ...entry.checklists];
        delete entry.checklists;
        delete entry.projects;
        delete entry.user_details;
      });
      return entries;
    },
    async publicFind() {
      const entries = await strapi.entityService.findMany(
        "api::municipality.municipality",
        {
          fields: ["id", "title"],
        }
      );
      return entries;
    },
    async delete(ctx) {
      const { id } = ctx.params;
      const entries = await strapi.entityService.findMany(
        "api::municipality.municipality",
        {
          filters: {
            id,
          },
          fields: ["title"],
          populate: { user_details: true },
        }
      );
      if (entries.length == 0) return ctx.badRequest("Keine Gemeinde gefunden");
      else if (entries[0].user_details.length > 0)
        return ctx.unauthorized(
          "Kann nicht löschen. Es gibt Benutzer, die mit dieser Gemeinde verbunden sind."
        );
      else return super.delete(ctx);
    },
    async count() {
      return await strapi.db.query("api::municipality.municipality").count();
    },
  })
);
