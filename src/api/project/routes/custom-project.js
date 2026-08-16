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
    },
    {
      method: "GET",
      path: "/project/scouting",
      handler: "project.listForScouting",
    },
    {
      method: "POST",
      path: "/projects/:projectId/funding-matches",
      handler: "project.receiveFundingMatches",
    },
    {
      method: "GET",
      path: "/projects/:projectId/funding-suggestions",
      handler: "project.listFundingSuggestions",
    },
    {
      method: "PATCH",
      path: "/projects/:projectId/funding-suggestions/:suggestionId/ignore",
      handler: "project.ignoreFundingSuggestion",
    }
  ],
};
