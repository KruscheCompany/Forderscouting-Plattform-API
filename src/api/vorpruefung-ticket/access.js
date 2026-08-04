"use strict";

/**
 * Shared project-access check for vorpruefung-ticket actions that need to
 * verify the requesting user can actually see the underlying project (the
 * same owner/editor/reader/visibility model `project.js`'s own controller
 * uses) before reading or writing a ticket tied to it. Lives here, not in
 * `recipient.js`, since it serves a different concern (authorization, not
 * recipient resolution) even though both are small shared helpers for this
 * content-type's custom controller actions.
 */

async function userCanAccessProject(strapi, user, projectId) {
  if (user.role.type === "admin") {
    return true;
  }

  const project = await strapi.entityService.findOne("api::project.project", projectId, {
    fields: ["id", "visibility"],
    populate: {
      owner: { fields: ["id"] },
      editors: { fields: ["id"] },
      readers: { fields: ["id"] },
    },
  });

  if (!project) {
    return false;
  }

  const isOwner = !!project.owner && project.owner.id === user.id;
  const isEditor = (project.editors || []).some((e) => e.id === user.id);
  const isReader = (project.readers || []).some((r) => r.id === user.id);
  const isOpenVisibility = project.visibility === "all users";

  return isOwner || isEditor || isReader || isOpenVisibility;
}

module.exports = { userCanAccessProject };
