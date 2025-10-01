module.exports = {
  routes: [
    {
      method: "POST",
      path: "/funding/external/create",
      handler: "funding.createExternalFunding",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
      },
    },
  ],
};
