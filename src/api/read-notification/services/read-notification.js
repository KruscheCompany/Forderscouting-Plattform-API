'use strict';

/**
 * read-notification service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::read-notification.read-notification');
