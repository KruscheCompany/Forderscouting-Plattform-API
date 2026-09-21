"use strict";

const { t } = require("../../../utils/i18n");
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
          return ctx.badRequest(t(ctx, "Sie haben keine Erlaubnis."));
        }
      } else {
        return ctx.badRequest(t(ctx, "Sie haben keine Erlaubnis."));
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
    //This function will recieve errors from Sentry webhooks and will send them to Teams
    //I didn't want to create new content types :D sorry but this seems a good place for it
    async relayErrorsToTeams(ctx) {
      const crypto = require("crypto");
      const provided = Buffer.from(String(ctx.request.headers["x-teams-hook-pass"] || ""));
      const expected = Buffer.from(String(process.env.TEAMS_HOOK_PASS || ""));
      const authorized =
        provided.length === expected.length &&
        expected.length > 0 &&
        crypto.timingSafeEqual(provided, expected);
      if (!authorized)
        return ctx.badRequest(t(ctx, "you are not allowed here."));
      const axios = require("axios");
      const body = ctx.request.body;
      const sentryUrl = `${body["url"]}`;
      let isSafeSentryUrl = false;
      try {
        const parsed = new URL(sentryUrl);
        isSafeSentryUrl =
          parsed.protocol === "https:" &&
          (parsed.hostname === "sentry.io" ||
            parsed.hostname.endsWith(".sentry.io"));
      } catch (e) {
        isSafeSentryUrl = false;
      }
      var teamsMsg = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.4",
        body: [
          {
            type: "TextBlock",
            text: `${body["event"]["title"]}`,
            weight: "Bolder",
            size: "Medium",
            color: "Attention",
            wrap: true,
          },
          {
            type: "FactSet",
            facts: [
              { title: "Project", value: `${body["project_slug"]}` },
              { title: "Environment", value: `${body["event"]["environment"]}` },
              { title: "Detail", value: `${body["event"]["metadata"]["filename"]} ${body["event"]["metadata"]["function"]}` },
              { title: "Culprit", value: `${body["culprit"]}` },
            ],
          },
        ],
        actions: isSafeSentryUrl
          ? [
              {
                type: "Action.OpenUrl",
                title: "Open in Sentry",
                url: sentryUrl,
              },
            ]
          : [],
      };
      var teamsReply = await axios.post(process.env.TEAMS_HOOK_URL, teamsMsg);
      console.log(teamsReply.data);
      return "all good";
    },
  })
);
