module.exports = {
  routes: [
    {
      method: "GET",
      path: "/tags/simple",
      handler: "tag.simpleFindTags",
    },
    {
      method: "POST",
      path: "/tags/suggest-create",
      handler: "tag.suggestCreateTag",
      config: {
        middlewares: [
          {
            name: "plugin::users-permissions.rateLimit",
            config: { interval: { min: 5 }, max: 30 },
          },
        ],
      },
    },
    {
      method: "POST",
      path: "/tags/proxy-suggest",
      handler: "tag.proxySuggestTaxonomy",
      config: {
        middlewares: [
          {
            name: "plugin::users-permissions.rateLimit",
            config: { interval: { min: 5 }, max: 30 },
          },
        ],
      },
    },
  ],
};
