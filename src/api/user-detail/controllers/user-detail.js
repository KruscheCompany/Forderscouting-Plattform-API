"use strict";

const { t } = require("../../../utils/i18n");
/**
 *  user-detail controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::user-detail.user-detail",
  ({ strapi }) => ({
    async getEntry(ctx, populate) {
      var params = {
        fields: ["fullName"],
        filters: { user: { id: ctx.state.user.id } },
      };
      if (populate) {
        params.populate = {
          notifications: {
            populate: {
              app: true,
              email: true,
            },
          },
          municipality: {
            populate: {
              federalStates: true,
            },
          },
          landkreis: {
            populate: {
              federalStates: true,
              municipalities: true,
            },
          },
          profile: true,
        };
        delete params.fields;
      }
      return await strapi.entityService.findMany(
        "api::user-detail.user-detail",
        params
      );
    },
    async create(ctx) {
      if (ctx.request.body.data.invite) {
        let entity = await super.create(ctx);
        return entity;
      } else {
        return ctx.unauthorized(t(ctx, "Sie können für diesen Benutzer keinen Eintrag erstellen."));
      }
    },
    async update(ctx) {
      var hasEntry = await this.getEntry(ctx, false);
      if (hasEntry.length > 0) {
        delete ctx.request.body.data.municipality;
        delete ctx.request.body.data.landkreis;
        let entity = await super.update(ctx);
        return entity;
      } else {
        return ctx.unauthorized(t(ctx, "You can't update this entry for this user."));
      }
    },
    async find(ctx) {
      var entry = await this.getEntry(ctx, true);
      return entry.length > 0
        ? entry[0]
        : ctx.badRequest(t(ctx, "Benutzer hat keinen Eintrag"));
    },
    async transferData(ctx) {
      const fromId =
        ctx.request != undefined && ctx.request.query.hasOwnProperty("fromId")
          ? ctx.request.query.fromId
          : ctx.state.user.id;
      const toUser = await this.checkUserAvailable(ctx.params.id);
      const fromUser = await this.checkUserAvailable(fromId);
      const toScope =
        toUser?.user_detail?.municipality || toUser?.user_detail?.landkreis;
      const fromScope =
        fromUser?.user_detail?.municipality ||
        fromUser?.user_detail?.landkreis;
      if (
        toUser &&
        fromUser &&
        (!toScope || !fromScope || toScope.id !== fromScope.id)
      ) {
        return ctx.unauthorized(t(ctx, "Sie können keine Daten an eine andere Verwaltung als Ihre eigene übertragen"));
      }
      if (
        ctx.state.user.role.type == "admin" ||
        ctx.state.user.id != ctx.params.id ||
        toUser != null
      ) {
        const dataAndCount = await this.countAndGetTransferableData(ctx); // for owner transfer
        await this.transferDataToUser(ctx, dataAndCount, fromId);
        return dataAndCount;
      } else {
        return ctx.unauthorized(t(ctx, "Sie können keine Daten an sich selbst übertragen. Und/oder der Benutzer, zu dem Sie übertragen, existiert nicht."));
      }
    },
    async countAndGetTransferableData(ctx) {
      const fromId =
        ctx.request != undefined && ctx.request.query.hasOwnProperty("fromId")
          ? ctx.request.query.fromId
          : ctx.state.user.id;
      var dataCount = {
        project: {},
        funding: {},
        watchlist: {},
        count: {
          projectsCount: 0,
          fundingsCount: 0,
          watchlistCount: 0,
        },
      };
      [dataCount.project, dataCount.count.projectsCount] = await strapi.db
        .query("api::project.project")
        .findWithCount({
          select: ["id"],
          where: {
            owner: { id: fromId },
          },
        });
      [dataCount.funding, dataCount.count.fundingsCount] = await strapi.db
        .query("api::funding.funding")
        .findWithCount({
          select: ["id"],
          where: {
            owner: { id: fromId },
          },
        });
      [dataCount.watchlist, dataCount.count.watchlistCount] = await strapi.db
        .query("api::watchlist.watchlist")
        .findWithCount({
          select: ["id"],
          where: {
            owner: { id: fromId },
          },
        });
      return dataCount;
    },
    async transferDataToUser(ctx, data, fromId) {
      ctx.request.query.data = ctx.request.query.data.toLowerCase();
      var dataToTransfer = ctx.request.query.data.split(",");

      //loop through the keys (items to transfer)
      for (var key in data) {
        //ignore the items that werent selected to transfer
        if (!dataToTransfer.includes(key) || key == "count") continue;

        if (key != "watchlist") {
          // Transfer reader and editor roles with constraint handling
          await this._transferEditorReaderRoles(ctx, key, fromId, data[key]);
        }

        //loop through the items to transfer each one of them
        for (var index = 0; index < data[key].length; index++) {
          //have to check each watchlist item to see if the user being transfered to already has one.
          //This is to prevent duplicates
          var item = data[key][index];
          if (key == "watchlist")
            var watchlistExist = await this.checkUserHasWatchlist(ctx, item);
          if (key == "watchlist" && !watchlistExist) continue;
          await strapi.db.query("api::" + key + "." + key).update({
            where: { id: item.id },
            data: {
              owner: {
                id: ctx.params.id,
              },
            },
          });
        }
      }
    },
    async _transferEditorReaderRoles(ctx, key, fromId, items) {
      const toUserId = ctx.params.id;
      const tableName = `${key}s`;

      // Get all document IDs for this type
      const documentIds = items.map(item => item.id);

      if (documentIds.length === 0) return;

      // For editors
      // First, check which documents the target user is already an editor of
      const existingEditorLinks = await strapi.db.connection.context.raw(
        `SELECT ${key}_id FROM ${tableName}_editors_links WHERE user_id = ?`,
        [toUserId]
      );

      const existingEditorDocIds = existingEditorLinks[0].map(row => row[`${key}_id`]);

      // Delete old user's editor links where target user already has editor access
      if (existingEditorDocIds.length > 0) {
        await strapi.db.connection.context.raw(
          `DELETE FROM ${tableName}_editors_links WHERE user_id = ? AND ${key}_id IN (?)`,
          [fromId, existingEditorDocIds]
        );
      }

      // Update remaining editor links (where target user is not already an editor)
      const docsToUpdate = documentIds.filter(id => !existingEditorDocIds.includes(id));
      if (docsToUpdate.length > 0) {
        await strapi.db.connection.context.raw(
          `UPDATE ${tableName}_editors_links SET user_id = ? WHERE user_id = ? AND ${key}_id IN (?)`,
          [toUserId, fromId, docsToUpdate]
        );
      }

      // For readers
      // Check which documents the target user is already a reader of
      const existingReaderLinks = await strapi.db.connection.context.raw(
        `SELECT ${key}_id FROM ${tableName}_readers_links WHERE user_id = ?`,
        [toUserId]
      );

      const existingReaderDocIds = existingReaderLinks[0].map(row => row[`${key}_id`]);

      // Delete old user's reader links where target user already has reader access
      if (existingReaderDocIds.length > 0) {
        await strapi.db.connection.context.raw(
          `DELETE FROM ${tableName}_readers_links WHERE user_id = ? AND ${key}_id IN (?)`,
          [fromId, existingReaderDocIds]
        );
      }

      // Update remaining reader links (where target user is not already a reader)
      const docsToUpdateReaders = documentIds.filter(id => !existingReaderDocIds.includes(id));
      if (docsToUpdateReaders.length > 0) {
        await strapi.db.connection.context.raw(
          `UPDATE ${tableName}_readers_links SET user_id = ? WHERE user_id = ? AND ${key}_id IN (?)`,
          [toUserId, fromId, docsToUpdateReaders]
        );
      }
    },
    async checkUserAvailable(id) {
      const user = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        id,
        {
          fields: ["username"],
          populate: {
            user_detail: {
              populate: {
                municipality: { fields: ["title"] },
                landkreis: { fields: ["title"] },
              },
            },
          },
        }
      );

      return user;
    },
    async checkUserHasWatchlist(ctx, item) {
      const currentWatchlist = await strapi.entityService.findOne(
        "api::watchlist.watchlist",
        item.id,
        {
          fields: ["id"],
          populate: {
            project: {
              fields: ["id"],
            },
            funding: {
              fields: ["id"],
            },
          },
        }
      );
      delete currentWatchlist.id;
      currentWatchlist.owner = {
        id: ctx.params.id,
      };
      const entry = await strapi.db.query("api::watchlist.watchlist").findOne({
        where: currentWatchlist,
      });
      return entry == null;
    },
    async dataOverview(ctx) {
      if (ctx.state.user.role.type == "admin")
        return await this.adminOverview(ctx);
      // let projects = await strapi.controller("api::project.project").find(ctx);
      let projects = await strapi.entityService.findMany(
        "api::project.project",
        {
          fields: [
            "title",
            "visibility",
            "published",
            "plannedStart",
            "plannedEnd",
            "updatedAt"
          ],
          filters: {
            $or: [
              {
                owner: { id: ctx.state.user.id },
              },
              {
                editors: { id: ctx.state.user.id },
              },
              {
                readers: { id: ctx.state.user.id },
              },
              {
                visibility: "listed only",
              },
              {
                visibility: "all users",
              },
            ],
            $and: [
              {
                $or: [
                  {
                    published: true,
                  },
                  {
                    $and: [
                      {
                        published: false,
                      },
                      {
                        owner: { id: ctx.state.user.id },
                      },
                    ],
                  },
                ],
              },
              {
                archived: false,
              },
            ],
          },
          populate: {
            owner: {
              fields: ["username"],
              populate: {
                user_detail: {
                  fields: ["fullName", "location"],
                  populate: {
                    municipality: { fields: ["title"] },
                  },
                },
              },
            },
            categories: { fields: ["title"] },
            editors: { fields: ["username"] },
            readers: { fields: ["username"] },
            tags: { fields: ["title"] },
            municipality: { fields: ["title", "id"] },
            info: "*",
          },
        }
      );
      let fundings = await strapi.controller("api::funding.funding").find(ctx);

      return { fundings, projects };
    },
    async adminOverview(ctx) {
      let projects = await strapi.entityService.findMany(
        "api::project.project",
        {
          fields: ["title", "plannedStart", "plannedEnd", "updatedAt"],
          populate: {
            owner: {
              fields: ["username"],
              populate: {
                user_detail: {
                  fields: ["fullName"],
                  populate: { municipality: { fields: ["title"] } },
                },
              },
            },
            categories: { fields: ["title"] },
            editors: { fields: ["username"] },
            readers: { fields: ["username"] },
            tags: { fields: ["title"] },
          },
          filters: {
            archived: false,
            published: true,
          },
        }
      );
      let fundings = await strapi.entityService.findMany(
        "api::funding.funding",
        {
          fields: ["title", "plannedStart", "plannedEnd", "updatedAt"],
          populate: {
            owner: {
              fields: ["username"],
              populate: {
                user_detail: {
                  fields: ["fullName"],
                  populate: { municipality: { fields: ["title"] } },
                },
              },
            },
            categories: { fields: ["title"] },
            editors: { fields: ["username"] },
            readers: { fields: ["username"] },
            tags: { fields: ["title"] },
          },
          filters: {
            archived: false,
            published: true,
          },
        }
      );
      return { fundings, projects };
    },
    async statsAndArchive(ctx) {
      if (!ctx.state.user || ctx.state.user.role.type !== "admin") {
        return ctx.unauthorized(t(ctx, "Nur Administrator*innen können Statistiken einsehen."));
      }

      const projectTotalDups = await strapi
        .controller("api::project.project")
        .totalDuplications();

      const suggestions = await strapi.entityService.findMany(
        "api::funding-suggestion.funding-suggestion",
        { fields: ["score", "status"] }
      );
      const notifiedOrResolved = suggestions.filter((s) => s.status !== "new");
      const accepted = suggestions.filter((s) => s.status === "accepted").length;
      const ignored = suggestions.filter((s) => s.status === "ignored").length;
      const decided = accepted + ignored;
      const scoreBucket = (score) => {
        const pct = Number(score) * 100;
        if (pct >= 90) return "90+";
        if (pct >= 80) return "80-90";
        return "<80";
      };
      const buckets = ["90+", "80-90", "<80"].map((bucket) => {
        const inBucket = suggestions.filter((s) => scoreBucket(s.score) === bucket);
        const bucketAccepted = inBucket.filter((s) => s.status === "accepted").length;
        const bucketDecided = inBucket.filter((s) => s.status === "accepted" || s.status === "ignored").length;
        return {
          bucket,
          total: inBucket.length,
          accepted: bucketAccepted,
          ignored: inBucket.filter((s) => s.status === "ignored").length,
          acceptanceRate: bucketDecided > 0 ? bucketAccepted / bucketDecided : null,
        };
      });

      let stats = {
        fundings: await strapi.controller("api::funding.funding").count(),
        archivedFundings: await strapi
          .controller("api::funding.funding")
          .countArchived(),
        projects: await strapi.controller("api::project.project").count(),
        archivedProjects: await strapi
          .controller("api::project.project")
          .countArchived(),
        users: await strapi.db.query("plugin::users-permissions.user").count(),
        watchlists: await strapi.controller("api::watchlist.watchlist").count(),
        municipalities: await strapi
          .controller("api::municipality.municipality")
          .count(),
        totalDups: projectTotalDups,
        projectTotalDups,
        aiSuggestions: {
          total: suggestions.length,
          notified: notifiedOrResolved.length,
          accepted,
          ignored,
          pending: notifiedOrResolved.length - decided,
          acceptanceRate: decided > 0 ? accepted / decided : null,
          byScoreBucket: buckets,
        },
      };
      let table = {
        projects: await strapi
          .controller("api::project.project")
          ._findArchivedEntries({ archived: true }),
        fundings: await strapi
          .controller("api::funding.funding")
          .findArchived(),
      };
      return { stats, table };
    },
    async marketingStats(ctx) {
      if (!ctx.state.user || ctx.state.user.role.type !== "admin") {
        return ctx.unauthorized(t(ctx, "Nur Administrator*innen können Statistiken einsehen."));
      }

      const monthKey = (date) => {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      };

      const now = new Date();
      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
          label: d.toLocaleString("de-DE", { month: "short" }),
        });
      }
      const firstMonthKey = months[0].key;

      const buildSeries = (records) => {
        const perMonth = {};
        months.forEach((m) => (perMonth[m.key] = 0));
        let before = 0;
        records.forEach((r) => {
          const key = monthKey(r.createdAt);
          if (key < firstMonthKey) {
            before++;
            return;
          }
          if (perMonth[key] !== undefined) perMonth[key]++;
        });
        const news = months.map((m) => perMonth[m.key]);
        let running = before;
        const cum = news.map((n) => (running += n));
        return { before, news, cum };
      };

      const [allProjectDates, allFundingDates, allUsers, activeProjects, allMunicipalities] = await Promise.all([
        strapi.entityService.findMany("api::project.project", { fields: ["createdAt"] }),
        strapi.entityService.findMany("api::funding.funding", { fields: ["createdAt"] }),
        strapi.db.query("plugin::users-permissions.user").findMany({ select: ["createdAt"] }),
        strapi.entityService.findMany("api::project.project", {
          fields: ["title", "status", "createdAt"],
          filters: { archived: false },
          populate: {
            municipality: { fields: ["id", "title"] },
            categories: { fields: ["id", "title"] },
            tags: { fields: ["id", "title"] },
            financialPlan: { populate: { costAndFinance: true } },
          },
        }),
        strapi.entityService.findMany("api::municipality.municipality", { fields: ["id", "title"] }),
      ]);

      const growth = {
        months: months.map((m) => m.label),
        projects: buildSeries(allProjectDates),
        fundings: buildSeries(allFundingDates),
        users: buildSeries(allUsers),
      };

      const parseCostAndFinance = (project) => {
        const sums = { gesamtinvestition: 0, foerdermittel: 0 };
        const items = project.financialPlan && project.financialPlan.costAndFinance;
        if (!items) return sums;
        items.forEach((item) => {
          if (!item.value) return;
          const normalized = String(item.value).replace(/\./g, "").replace(",", ".");
          const numValue = parseFloat(normalized) || 0;
          if (item.title === "Gesamtinvestition") sums.gesamtinvestition += numValue;
          else if (item.title === "Fördermittel") sums.foerdermittel += numValue;
        });
        return sums;
      };

      const submittedStatuses = ["sentToFunding", "grantNotice", "rejectionNotice"];
      let totalInvestment = 0;
      let requestedFunding = 0;
      let securedFunding = 0;
      const municipalityCounts = new Map();
      const categoryCounts = new Map();
      const tagCounts = new Map();
      const funnelCounts = { inProgress: 0, sentToFunding: 0, grantNotice: 0, rejectionNotice: 0 };
      const stories = [];

      activeProjects.forEach((project) => {
        const { gesamtinvestition, foerdermittel } = parseCostAndFinance(project);
        totalInvestment += gesamtinvestition;
        if (submittedStatuses.includes(project.status)) requestedFunding += foerdermittel;
        if (project.status === "grantNotice") securedFunding += foerdermittel;

        const statusKey = project.status || "inProgress";
        funnelCounts[statusKey] = (funnelCounts[statusKey] || 0) + 1;

        if (project.municipality) {
          const key = project.municipality.id;
          const entry = municipalityCounts.get(key) || { title: project.municipality.title, count: 0 };
          entry.count++;
          municipalityCounts.set(key, entry);
        }

        (project.categories || []).forEach((cat) => {
          const entry = categoryCounts.get(cat.id) || { title: cat.title, count: 0 };
          entry.count++;
          categoryCounts.set(cat.id, entry);
        });

        (project.tags || []).forEach((tag) => {
          const entry = tagCounts.get(tag.id) || { title: tag.title, count: 0 };
          entry.count++;
          tagCounts.set(tag.id, entry);
        });

        if (project.status === "grantNotice" && foerdermittel > 0) {
          stories.push({
            title: project.title,
            municipality: project.municipality ? project.municipality.title : null,
            category: project.categories && project.categories[0] ? project.categories[0].title : null,
            amount: foerdermittel,
          });
        }
      });

      const leaderboard = [...municipalityCounts.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
      const topics = [...categoryCounts.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 11);
      const tags = [...tagCounts.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 11);
      stories.sort((a, b) => b.amount - a.amount);

      return {
        projectTotal: activeProjects.length,
        growth,
        funding: {
          totalInvestment,
          requestedFunding,
          securedFunding,
        },
        funnel: funnelCounts,
        regional: {
          activeMunicipalities: municipalityCounts.size,
          totalMunicipalities: allMunicipalities.length,
          leaderboard,
        },
        topics,
        tags,
        stories: stories.slice(0, 5),
      };
    },
    async notification(ctx) {
      const userDetails = await this.find(ctx);
      const userSettings = userDetails.notifications.app;
      const userId = ctx.state.user.id;
      const type = ctx.state.user.role.type;
      if (userSettings.dataRequests && type != "guest") {
        var requests = await this._getRequests(ctx);
      }
      if (["admin", "leader"].includes(type)) {
        if (userSettings.userJoinRequest) {
          var guest = await this._getGuestsRequests(ctx, type, userDetails);
        }
        if (userSettings.fundingComments && type == "admin") {
          var fundingComments = await this._getFundingComments(ctx);
        }
        if (userSettings.tagPendingApproval && type == "admin") {
          var pendingTags = await this._getPendingTags(ctx);
        }
      }

      if (type != "guest" && userSettings.tagReviewDecision) {
        var tagDecisions = await this._getTagDecisions(ctx);
      }

      let fundingSuggestions = [];
      if (type != "guest" && userSettings.fundingSuggestion) {
        fundingSuggestions = await this._getFundingSuggestions(ctx);
      }

      let fundingExpirey = [];
      if (userSettings.fundingExpiry)
        fundingExpirey = await strapi
          .controller("api::funding.funding")
          .getFundingExpirey(ctx);

      fundingExpirey = fundingExpirey
        .filter(
          (fe) =>
            !fe.read_notifications.some(
              (rn) => rn.user && rn.user.id === userId
            )
        )
        .map((fe) => {
          const { read_notifications, ...rest } = fe;
          return rest;
        });
      return { requests, guest, fundingComments, fundingExpirey, pendingTags, tagDecisions, fundingSuggestions };
    },
    //This API is to get specific user-detail of a user. For project ideas. For the Contact Person information section
    async getContactPersonInfo(ctx, id) {
      const userContactInfo = await strapi.entityService.findOne(
        "api::user-detail.user-detail",
        id,
        {
          fields: ["fullName", "phone", "postalCode", "streetNo"],
          populate: {
            user: { fields: ["email"] },
          },
        }
      );
      userContactInfo.contactName = userContactInfo.fullName;
      delete userContactInfo.fullName;
      userContactInfo.email = userContactInfo.user.email;
      delete userContactInfo.user;
      delete userContactInfo.id;
      return userContactInfo;
    },
    async publicData() {
      var projects = await strapi
        .controller("api::project.project")
        .publicFind();
      var fundings = await strapi
        .controller("api::funding.funding")
        .publicFind();
      var municipalities = await strapi
        .controller("api::municipality.municipality")
        .publicFind();
      return { projects, fundings, municipalities };
    },
    async updateFileCaption(ctx) {
      const { id } = ctx.params;
      const { caption, docId, type } = ctx.request.body;
      if (!["funding", "project"].includes(type))
        return ctx.badRequest(t(ctx, "Invalid type."));
      ctx.params.id = docId;
      const hasEditRole = await strapi
        .controller(`api::${type}.${type}`)
        .hasEditRole(ctx);
      if (hasEditRole) {
        const fileData = await strapi.plugins["upload"].services.upload.findOne(
          id
        );
        return await strapi.plugins["upload"].services.upload.updateFileInfo(
          id,
          {
            name: fileData.name,
            alternativeText: fileData.alternativeText,
            caption,
          }
        );
      } else
        return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, diese Aktion durchzuführen"));
    },
    async _getFundingComments(ctx) {
      const fundingComments = await strapi.entityService.findMany(
        "api::funding-comment.funding-comment",
        {
          fields: ["comment", "created_at"],
          populate: {
            funding: { fields: ["title"] },
            owner: { fields: ["username"] },
            read_notifications: { populate: ["user"] },
          },
        }
      );

      // Post-filtering to ensure that none of the related read_notifications have user.id = userId
      const userId = ctx.state.user.id;
      const filteredFundingComments = fundingComments
        .filter(
          (fc) =>
            !fc.read_notifications.some(
              (rn) => rn.user && rn.user.id === userId
            )
        )
        .map((fc) => {
          const { read_notifications, ...rest } = fc;
          return rest;
        });

      return filteredFundingComments;
    },

    async _getPendingTags(ctx) {
      const userId = ctx.state.user.id;
      const tags = await strapi.entityService.findMany("api::tag.tag", {
        fields: ["title", "status", "createdAt"],
        filters: { status: "pending" },
        populate: { read_notifications: { populate: ["user"] } },
      });

      return tags
        .filter(
          (t) =>
            !t.read_notifications.some((rn) => rn.user && rn.user.id === userId)
        )
        .map((t) => {
          const { read_notifications, ...rest } = t;
          return rest;
        });
    },

    async _getTagDecisions(ctx) {
      const userId = ctx.state.user.id;
      const decisions = await strapi.entityService.findMany(
        "api::tag-decision.tag-decision",
        {
          fields: ["title", "decision", "createdAt"],
          filters: { submittedBy: userId },
          populate: { read_notifications: { populate: ["user"] } },
        }
      );

      return decisions
        .filter(
          (d) =>
            !d.read_notifications.some((rn) => rn.user && rn.user.id === userId)
        )
        .map((d) => {
          const { read_notifications, ...rest } = d;
          return rest;
        });
    },

    async _getFundingSuggestions(ctx) {
      const userId = ctx.state.user.id;
      const suggestions = await strapi.entityService.findMany(
        "api::funding-suggestion.funding-suggestion",
        {
          fields: ["title", "score", "reasoning", "notifiedAt", "createdAt"],
          filters: {
            status: "notified",
            project: { $or: [{ owner: { id: userId } }, { editors: { id: userId } }] },
          },
          populate: {
            project: { fields: ["title"] },
            read_notifications: { populate: ["user"] },
          },
        }
      );

      const unread = suggestions
        .filter(
          (s) => !s.read_notifications.some((rn) => rn.user && rn.user.id === userId)
        )
        .map((s) => {
          const { read_notifications, ...rest } = s;
          return rest;
        });

      const byProject = {};
      unread.forEach((s) => {
        const key = s.project.id;
        const timestamp = s.notifiedAt || s.createdAt;
        if (!byProject[key]) {
          byProject[key] = {
            id: key,
            project: s.project,
            createdAt: timestamp,
            suggestions: [],
          };
        }
        byProject[key].suggestions.push(s);
        if (new Date(timestamp) > new Date(byProject[key].createdAt)) {
          byProject[key].createdAt = timestamp;
        }
      });

      return Object.values(byProject);
    },

    async _getGuestsRequests(ctx, type, userDetails) {
      const userId = ctx.state.user.id;

      const options = {
        populate: {
          municipality: { fields: ["title", "id"] },
          categories: { fields: ["title", "id"] },
          read_notifications: { populate: ["user"] }, // Ensure user is populated in read_notifications
        },
        filters: {},
      };

      if (type === "leader") {
        if (userDetails.municipality) {
          options.filters.municipality = {
            id: userDetails.municipality.id,
          };
        } else if (userDetails.landkreis) {
          const municipalityIds = (userDetails.landkreis.municipalities || []).map(
            (m) => m.id
          );
          options.filters.municipality = { id: { $in: municipalityIds } };
        }
      }

      const guestRequests = await strapi.entityService.findMany(
        "api::guest-request.guest-request",
        options
      );

      // Post-filtering to ensure that none of the related read_notifications have user.id = userId
      const filteredGuestRequests = guestRequests
        .filter(
          (gr) =>
            !gr.read_notifications.some(
              (rn) => rn.user && rn.user.id === userId
            )
        )
        .map((gr) => {
          const { read_notifications, ...rest } = gr;
          return rest;
        });

      return filteredGuestRequests;
    },
    async _getRequests(ctx) {
      const userId = ctx.state.user.id;
      const fields = ["approved", "type", "created_at"];
      const filters = {
        $or: [
          {
            read_notifications: {
              user: {
                id: {
                  $not: userId,
                },
              },
            },
          },
          {
            read_notifications: {
              user: null,
            },
          },
        ],
      };
      const populate = {
        user: {
          fields: ["username"],
          populate: {
            user_detail: {
              populate: {
                municipality: { fields: ["id"] },
                landkreis: { fields: ["id"] }
              }
            }
          }
        },
        funding: { fields: ["title"] },
        project: { fields: ["title"] },
        read_notifications: { populate: ["user"] },
      };

      if (ctx.state.user.role.type === "leader") {
        // Get the leader's municipality (or landkreis) scope
        const userDetails = await this.find(ctx);
        const leaderMunicipalityId = userDetails.municipality?.id;
        const leaderLandkreisId = userDetails.landkreis?.id;

        filters.guest = true;
        filters.leaderApproved = false;

        // Add municipality/landkreis filter for leaders
        if (leaderMunicipalityId) {
          filters.$and = [
            {
              user: {
                user_detail: {
                  municipality: {
                    id: leaderMunicipalityId
                  }
                }
              }
            }
          ];
        } else if (leaderLandkreisId) {
          filters.$and = [
            {
              user: {
                user_detail: {
                  landkreis: {
                    id: leaderLandkreisId
                  }
                }
              }
            }
          ];
        }

        populate.funding.populate = { owner: { fields: ["username"] } };
        populate.project.populate = { owner: { fields: ["username"] } };
      } else {
        fields.push("guest", "leaderApproved");
        filters.$and = [
          {
            $or: [
              {
                project: {
                  owner: userId,
                },
              },
              {
                funding: {
                  owner: userId,
                },
              },
            ],
          },
          {
            $or: [
              {
                $and: [{ guest: true }, { leaderApproved: true }],
              },
              {
                $and: [{ guest: false }, { leaderApproved: false }],
              },
            ],
          },
        ];
      }

      const requests = await strapi.entityService.findMany(
        "api::request.request",
        {
          filters,
          fields,
          populate,
        }
      );
      // Post-filtering to ensure that none of the related read_notifications have user.id = userId
      const filteredRequests = requests
        .filter(
          (gr) =>
            !gr.read_notifications.some(
              (rn) => rn.user && rn.user.id === userId
            )
        )
        .map((gr) => {
          const { read_notifications, ...rest } = gr;
          return rest;
        });
      return filteredRequests;
    },
    async changeOwnership(ctx) {
      const { type, id, newOwnerId } = ctx.request.body;

      if (!["funding", "project"].includes(type))
        return ctx.badRequest(t(ctx, "Invalid type."));

      const document = await strapi.db.query(`api::${type}.${type}`).findOne({
        select: ["id"],
        where: {
          $and: [
            { id },
            {
              owner: { id: ctx.state.user.id },
            },
          ],
        },
      });

      const newOwner = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        newOwnerId,
        {
          fields: ["id"],
        }
      );

      if (document == null || newOwner == null)
        return ctx.notFound(t(ctx, "Projekt oder neuer Besitzer nicht gefunden"));

      return await strapi.entityService.update(`api::${type}.${type}`, id, {
        data: {
          owner: newOwner.id,
        },
      });
    },
    async getFileAsPDF(ctx) {
      const token = ctx.request.query.token || ctx.request.header.authorization.split(" ")[1];
      try {
        await strapi.service("plugin::users-permissions.jwt").verify(token);
      } catch (error) {
        return ctx.unauthorized(t(ctx, "Ungültiges Token"));
      }
      const fs = require("fs");
      const path = require("path");
      const axios = require("axios");
      const FormData = require("form-data");
      const { id } = ctx.params;

      const document = await strapi.plugins.upload.services.upload.findOne(id);
      if (document == null) return ctx.notFound(t(ctx, "Datei nicht gefunden"));

      const filename = document.hash + document.ext;
      const uploadsDir = path.join(__dirname, "../../../../public/uploads/");
      const inputFilePath = path.join(uploadsDir, filename);
      const outputFilePath = inputFilePath.replace(
        path.extname(inputFilePath),
        ".pdf"
      );

      try {
        if (fs.existsSync(outputFilePath)) {
          // File exists, read and return it
          ctx.type = "application/pdf";
          ctx.body = fs.createReadStream(outputFilePath);
        } else {
          // File does not exist, convert it using Gotenberg
          const form = new FormData();
          form.append("files", fs.createReadStream(inputFilePath));

          const response = await axios.post(
            "http://localhost:3030/forms/libreoffice/convert",
            form,
            {
              headers: form.getHeaders(),
              responseType: "arraybuffer",
            }
          );

          if (response.status !== 200) {
            throw new Error(`Failed to convert file: ${response.statusText}`);
          }

          const buffer = await response.data;

          // Save the converted file
          fs.writeFileSync(outputFilePath, buffer);

          // Return the converted file
          ctx.type = "application/pdf";
          ctx.body = fs.createReadStream(outputFilePath);
        }
      } catch (err) {
        strapi.log.error(err);
        ctx.throw(500, t(ctx, "An internal error occurred. Please try again later."));
      }

      return document;
    },
  })
);
