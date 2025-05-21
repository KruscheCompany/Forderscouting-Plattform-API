module.exports = {
  routes: [
    {
      // Path defined with a URL parameter
      method: "POST",
      path: "/checklist/duplicate/:id",
      handler: "checklist.duplicateChecklistDirectly",
    },
  ],
};
