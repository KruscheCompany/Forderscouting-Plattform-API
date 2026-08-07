"use strict";

module.exports = {
  routes: [
    {
      method: "PUT",
      path: "/prioritized-projects/reorder",
      handler: "prioritized-project.reorder",
    },
  ],
};
