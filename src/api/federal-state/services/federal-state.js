'use strict';

/**
 * federal-state service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::federal-state.federal-state');
