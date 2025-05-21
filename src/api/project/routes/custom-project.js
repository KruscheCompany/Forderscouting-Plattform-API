module.exports = {
  routes: [
    {
      method: "POST",
      path: "/project/duplicate/:id",
      handler: "project.duplicateProjectDirectly",
    },
  ],
};
