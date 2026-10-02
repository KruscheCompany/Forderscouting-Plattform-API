'use strict';

/**
 * read-notification controller
 */

const { t } = require('../../../utils/i18n');
const { createCoreController } = require('@strapi/strapi').factories;

const UID = 'api::read-notification.read-notification';

module.exports = createCoreController(UID, ({ strapi }) => ({
  // Strapi drops a relation from API input unless the caller's role may `find`
  // the target type. System notices have no public route, so the system_notice
  // relation is attached here instead, always for the caller.
  async create(ctx) {
    const noticeId = ctx.request.body?.data?.system_notice;
    if (!noticeId) return super.create(ctx);

    const notice = await strapi.entityService.findOne('api::system-notice.system-notice', noticeId, {
      fields: ['id'],
    });
    if (!notice) return ctx.notFound(t(ctx, 'Hinweis nicht gefunden'));

    const userId = ctx.state.user.id;
    const entry =
      (await strapi.db.query(UID).findOne({ where: { user: userId, system_notice: notice.id } })) ||
      (await strapi.entityService.create(UID, { data: { user: userId, system_notice: notice.id } }));

    return this.transformResponse(await this.sanitizeOutput(entry, ctx));
  },
}));
