"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/system-ribbon/active",
      handler: "system-ribbon.active",
      config: {
        policies: [],
      },
    },
  ],
};
