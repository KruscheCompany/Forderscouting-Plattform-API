"use strict";

/**
 *  data-concent controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::data-concent.data-concent",
  ({ strapi }) => ({
    async findKey(ctx) {
      return await strapi.entityService.findMany(
        "api::data-concent.data-concent",
        {
          filters: {
            cKey: ctx.request.body.data.key,
          },
        }
      );
    },
    async update(ctx) {
      const body = ctx.request.body.data;
      if (body.hasOwnProperty("key")) {
        const key = await strapi.entityService.findMany(
          "api::data-concent.data-concent",
          {
            filters: {
              cKey: body.key,
            },
          }
        );
        if (key) {
          return await strapi.entityService.update(
            "api::data-concent.data-concent",
            key[0].id,
            { data: body }
          );
        } else {
          return ctx.badRequest("Sie haben keine Erlaubnis.");
        }
      } else {
        return ctx.badRequest("Sie haben keine Erlaubnis.");
      }
    },
    async generateKey(ctx) {
      const bcrypt = require("bcryptjs");
      var key = await this.generateRandomKey(30);
      key += ctx.request.headers["user-agent"];
      const hashedKey = await bcrypt.hash(key, 10);
      ctx.request.body.data = {
        cKey: hashedKey,
      };
      await super.create(ctx);
      return { key: hashedKey };
    },
    async generateRandomKey(length) {
      const chars =
        "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890";
      const randomArray = Array.from(
        { length },
        (v, k) => chars[Math.floor(Math.random() * chars.length)]
      );

      const randomString = randomArray.join("");
      return randomString;
    },
    //This function will recieve errors from Sentry webhooks and will send them to Slack
    //I didn't want to create new content types :D sorry but this seems a good place for it
    async relayErrorsToSlack(ctx) {
      if (ctx.params.authz != process.env.SLACK_HOOK_PASS)
        return ctx.badRequest("you are not allowed here.");
      const axios = require("axios");
      const body = ctx.request.body;
      var slackMsg = {
        attachments: [
          {
            pretext: `<${body["url"]}|Exception>\r\nproject: ${body["project_slug"]}\r\nenvironment: ${body["event"]["environment"]}\r\ndetail: ${body["event"]["metadata"]["filename"]} ${body["event"]["metadata"]["function"]}`,
            color: "#D00000",
            fields: [
              {
                title: `${body["event"]["title"]}`,
                value: `${body["culprit"]}`,
              },
            ],
          },
        ],
      };
      var slackReply = await axios.post(
        process.env.SLACK_HOOK_URL,
        slackMsg
      );
      console.log(slackReply.data);
      return "all good";
    },
  })
);
