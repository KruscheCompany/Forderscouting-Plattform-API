'use strict';

/**
 * watchlist service.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::watchlist.watchlist');
