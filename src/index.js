'use strict';

const { initSocket } = require('./utils/socket');
const { backfillLocationRelations } = require('./utils/location-relations-backfill');
const { backfillVorpruefungLiveKeys } = require('./utils/vorpruefung-live-key-backfill');

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/*{ strapi }*/) {},

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
  },
};
