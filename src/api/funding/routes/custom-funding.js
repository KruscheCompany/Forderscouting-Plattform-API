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
    {
      method: "POST",
      path: "/funding/proxy-upload",
      handler: "funding.proxyUploadFundingFile",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
      },
    },
  ],
};
