module.exports = {
  routes: [
    {
      // Path defined with a URL parameter
      method: "GET",
      path: "/concent/key",
      handler: "data-concent.generateKey",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
      },
    },
    {
      // Path defined with a URL parameter
      method: "POST",
      path: "/concent/findKey",
      handler: "data-concent.findKey",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
      },
    },
    {
      // Path defined with a URL parameter
      method: "POST",
      path: "/sentry/error/:authz",
      handler: "data-concent.relayErrorsToSlack",
    },
  ],
};
