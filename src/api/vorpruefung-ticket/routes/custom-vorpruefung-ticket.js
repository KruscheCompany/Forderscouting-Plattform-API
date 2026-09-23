"use strict";

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/vorpruefung-tickets/:id/resend",
      handler: "vorpruefung-ticket.resend",
    },
    {
      method: "POST",
      path: "/vorpruefung-tickets/:id/override",
      handler: "vorpruefung-ticket.override",
    },
    {
      method: "POST",
      path: "/vorpruefung-tickets/override",
      handler: "vorpruefung-ticket.override",
    },
    {
      method: "POST",
      path: "/vorpruefung-tickets/reset",
      handler: "vorpruefung-ticket.resetForProject",
    },
    {
      method: "PUT",
      path: "/vorpruefung-tickets/:id/notes",
      handler: "vorpruefung-ticket.updateNotes",
    },
    {
      method: "GET",
      path: "/vorpruefung-tickets/by-token/:token",
      handler: "vorpruefung-ticket.findByToken",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
      },
    },
    {
      method: "POST",
      path: "/vorpruefung-tickets/by-token/:token/respond",
      handler: "vorpruefung-ticket.respondByToken",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
      },
    },
  ],
};
