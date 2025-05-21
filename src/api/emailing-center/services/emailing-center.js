'use strict';

/**
 * emailing-center service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::emailing-center.emailing-center');
