'use strict';

const { initSocket } = require('./utils/socket');
const { backfillLocationRelations } = require('./utils/location-relations-backfill');
const { backfillVorpruefungLiveKeys } = require('./utils/vorpruefung-live-key-backfill');
const { backfillProjectVisibility } = require('./utils/project-visibility-backfill');

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    // Observe-only: Node still exits (pm2 restarts), but the cause lands in the
    // log first. Unhandled promise rejections surface here with origin
    // "unhandledRejection".
    process.on("uncaughtExceptionMonitor", (error, origin) => {
      strapi.log.error(`Process crash (${origin}): ${error?.message || error}`, {
        origin,
        errorName: error?.name,
        stack: error?.stack,
      });
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    initSocket(strapi);
    await backfillLocationRelations(strapi);
    await backfillVorpruefungLiveKeys(strapi);
    await backfillProjectVisibility(strapi);
  },
};
