"use strict";

/**
 * emailing-center controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::emailing-center.emailing-center",
  ({ strapi }) => ({
    async find(ctx) {
      const entities = await strapi.entityService.findMany(
        "api::emailing-center.emailing-center",
        {
          populate: ["attachments"],
        }
      );
      return entities;
    },
    async create(ctx) {
      const { group, subject, body } = JSON.parse(ctx.request.body.data);
      const files = ctx.request.files["files.attachments"];
      let attachments = [];

      const users = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          fields: ["email"],
          filters: {
            role: {
              id: {
                $in: group.split(","),
              },
            },
          },
        }
      );

      const emails = users.map((user) => user.email);

      if (Array.isArray(files) && files.length > 0) {
        attachments = files.map((attachment) => ({
          path: attachment.path,
          filename: attachment.name,
        }));
      } else if (files) {
        attachments = [
          {
            path: files.path,
            filename: files.name,
          },
        ];
      }

      const response = await strapi.plugins["email"].services.email.send({
        from: process.env.DEF_FROM,
        bcc: emails,
        replyTo: process.env.EC_DEF_FROM,
        subject: subject,
        html: body,
        attachments,
      });

      let created = await super.create(ctx);

      const status = response.rejected.length === 0;
      created = strapi.entityService.update(
        "api::emailing-center.emailing-center",
        created.data.id,
        {
          data: {
            status: status,
            response: response,
          },
        }
      );

      if (!status) {
        return {
          message: "E-Mail konnte nicht an alle Empfänger gesendet werden.",
          response,
        };
      }

      return created;
    },
  })
);
