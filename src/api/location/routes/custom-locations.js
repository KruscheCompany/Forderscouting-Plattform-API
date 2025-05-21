module.exports = {
  routes: [
    {
      method: "GET",
      path: "/locations/:id",
      handler: "location.findByMunicipality",
    },
    {
      method: "GET",
      path: "/locations/grouped/municipality",
      handler: "location.findGroupedByMunicipality",
    },
  ],
};
