module.exports = {
  routes: [
    {
      method: "GET",
      path: "/municipalities/simple",
      handler: "municipality.simpleFindMunicipalities",
    },
  ],
};
