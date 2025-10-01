module.exports = {
  routes: [
    {
      method: "GET",
      path: "/locations/by-municipality",
      handler: "location.findByMunicipality",
    },
    {
      method: "GET",
      path: "/locations/grouped/municipality",
      handler: "location.findGroupedByMunicipality",
    },
  ],
};
