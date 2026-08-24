"use strict";

const { emitToAll } = require("../../../../utils/socket");

function broadcast(result) {
  emitToAll("maintenanceMode", {
    enabled: result.enabled,
    message: result.message,
    scheduledStart: result.scheduledStart,
  });
}

module.exports = {
  async afterCreate(event) {
    broadcast(event.result);
  },
  async afterUpdate(event) {
    broadcast(event.result);
  },
};
