module.exports = {
  routes: [
    {
      method: "POST",
      path: "/project/duplicate/:id",
      handler: "project.duplicateProjectDirectly",
    },
    {
      method: "GET",
      path: "/project/dashboard/stat",
      handler: "project.projectDashboardStat",
    },
    {
      method: "GET",
      path: "/application/process",
      handler: "project.getApplicationProcess",
    },
    {
      method: "GET",
      path: "/application/validate/:id",
      handler: "project.validateApplicationAccess",
    },
    {
      method: "GET",
      path: "/project/dashboard/archived",
      handler: "project.findArchived",
    }
  ],
};
