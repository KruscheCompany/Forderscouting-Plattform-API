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
    {
      method: "POST",
      path: "/funding/proxy-match",
      handler: "funding.proxyMatchFunding",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
      },
    },
    {
      method: "POST",
      path: "/funding/proxy-questions/:fundingId",
      handler: "funding.proxyGetFundingQuestions",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
      },
    },
  ],
};
