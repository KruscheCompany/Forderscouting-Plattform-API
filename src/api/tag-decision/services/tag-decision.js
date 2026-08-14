'use strict';

/**
 * tag-decision service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::tag-decision.tag-decision');
