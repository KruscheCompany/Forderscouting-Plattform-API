"use strict";

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
        return ctx.unauthorized(
          "Sie können für diesen Benutzer keinen Eintrag erstellen."
        );
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
        return ctx.unauthorized("You can't update this entry for this user.");
      }
    },
    async find(ctx) {
      var entry = await this.getEntry(ctx, true);
      return entry.length > 0
        ? entry[0]
        : ctx.badRequest(`Benutzer hat keinen Eintrag`);
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
        return ctx.unauthorized(
          "Sie können keine Daten an eine andere Verwaltung als Ihre eigene übertragen"
        );
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
        return ctx.unauthorized(
          "Sie können keine Daten an sich selbst übertragen. Und/oder der Benutzer, zu dem Sie übertragen, existiert nicht."
        );
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

      return { fundings, projects};
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
      const projectTotalDups = await strapi
        .controller("api::project.project")
        .totalDuplications();
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
      };
      let table = {
        projects: await strapi
          .controller("api::project.project")
          .findArchived(),
        fundings: await strapi
          .controller("api::funding.funding")
          .findArchived(),
      };
      return { stats, table };
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
      return { requests, guest, fundingComments, fundingExpirey };
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
        return ctx.badRequest("Invalid type.");
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
        return ctx.unauthorized(
          "Sie sind nicht berechtigt, diese Aktion durchzuführen"
        );
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
        return ctx.badRequest("Invalid type.");

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
        return ctx.notFound("Projekt oder neuer Besitzer nicht gefunden");

      return await strapi.entityService.update(`api::${type}.${type}`, id, {
        data: {
          owner: newOwner.id,
        },
      });
    },
    async getFileAsPDF(ctx) {
      const token  = ctx.request.query.token || ctx.request.header.authorization.split(" ")[1];
      try {
        await strapi.service("plugin::users-permissions.jwt").verify(token);
      } catch (error) {
        return ctx.unauthorized("Ungültiges Token");
      }
      const fs = require("fs");
      const path = require("path");
      const axios = require("axios");
      const FormData = require("form-data");
      const { id } = ctx.params;

      const document = await strapi.plugins.upload.services.upload.findOne(id);
      if (document == null) return ctx.notFound("Datei nicht gefunden");

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
        ctx.throw(500, err.message || err);
      }

      return document;
    },
  })
);
