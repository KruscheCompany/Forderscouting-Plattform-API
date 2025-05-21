'use strict';

/**
 * guest-request service.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::guest-request.guest-request');
