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
        middlewares: ["plugin::users-permissions.rateLimit"],
      },
    },
    {
      method: "POST",
      path: "/tags/proxy-suggest",
      handler: "tag.proxySuggestTaxonomy",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
      },
    },
  ],
};
