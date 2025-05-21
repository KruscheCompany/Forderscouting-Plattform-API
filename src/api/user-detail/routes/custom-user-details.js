module.exports = {
  routes: [
    {
      method: "GET",
      path: "/user/transfer/:id",
      handler: "user-detail.transferData",
    },
    {
      method: "POST",
      path: "/change/document/ownership/",
      handler: "user-detail.changeOwnership",
    },
    {
      method: "GET",
      path: "/user/overview",
      handler: "user-detail.dataOverview",
    },
    {
      method: "GET",
      path: "/user/notification",
      handler: "user-detail.notification",
    },
    {
      method: "GET",
      path: "/stats",
      handler: "user-detail.statsAndArchive",
    },
    {
      method: "GET",
      path: "/public/data",
      handler: "user-detail.publicData",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
      },
    },
    {
      method: "PUT",
      path: "/upload/caption/:id",
      handler: "user-detail.updateFileCaption",
    },
    {
      method: "GET",
      path: "/file/:id",
      handler: "user-detail.getFileAsPDF",
    },
  ],
};
