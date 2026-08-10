"use strict";

const { t } = require("../../../utils/i18n");
const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::project.project", ({ strapi }) => ({
  async find(ctx) {
    if (ctx.state.user.role.type != "guest") {
      const visibilityOr = [
        { owner: { id: ctx.state.user.id } },
        { editors: { id: ctx.state.user.id } },
        { readers: { id: ctx.state.user.id } },
        { visibility: "listed only" },
        { visibility: "all users" },
      ];
      if (ctx.state.user.role && ctx.state.user.role.type === "admin") {
        visibilityOr.push({ visibility: "only for me" });
      }

      const entries = await strapi.entityService.findMany(
        "api::project.project",
        {
          fields: [
            "title",
            "visibility",
            "published",
            "plannedStart",
            "plannedEnd",
            "status",
            "updatedAt",
            "applicationProcessSteps",
            "fundingMatches"
          ],
          filters: {
            $or: visibilityOr,
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
                  fields: ["fullName"],
                  populate: { municipality: { fields: ["title"] } },
                },
              },
            },
            categories: { fields: ["title"] },
            editors: { fields: ["username"] },
            readers: { fields: ["username"] },
            tags: { fields: ["title"] },
            municipality: { fields: ["title", "id"] },
          },
        }
      );
      return entries;
    } else {
      var userLocation = await strapi.entityService.findMany(
        "api::user-detail.user-detail",
        {
          filters: {
            user: { id: ctx.state.user.id },
          },
          populate: {
            municipality: { fields: ["title", "id"] },
          },
        }
      );
      userLocation = userLocation[0].location;

      const visibilityOrGuest = [
        { owner: { id: ctx.state.user.id } },
        { editors: { id: ctx.state.user.id } },
        { readers: { id: ctx.state.user.id } },
        { visibility: "listed only" },
        { visibility: "all users" },
      ];
      if (ctx.state.user.role && ctx.state.user.role.type === "admin") {
        visibilityOrGuest.push({ visibility: "only for me" });
      }

      const entries = await strapi.entityService.findMany(
        "api::project.project",
        {
          fields: [
            "title",
            "visibility",
            "published",
            "plannedStart",
            "plannedEnd",
            "status"
          ],
          filters: {
            $or: visibilityOrGuest,
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
              {
                info: { location: userLocation },
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

      return entries;
    }
  },
  async findOne(ctx) {
    let filters = {
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
      id: ctx.params.id,
    };
    if (ctx.state.user.role.type == "admin") {
      filters = { id: ctx.params.id }
    }

    var entry = await strapi.entityService.findMany("api::project.project", {
      populate: {
        owner: { fields: ["username"], populate: { user_detail: "*" } },
        editors: { fields: ["username"] },
        readers: { fields: ["username"] },
        categories: { fields: ["title"] },
        tags: { fields: ["title"] },
        info: "*",
        details: "*",
        links: "*",
        media: "*",
        files: "*",
        applicationDecisionFiles: "*",
        fundingGuideline: { fields: ["title"], populate: { info: { fields: ["email"] } } },
        municipality: { fields: ["title", "location", "financeContactEmail", "personnelContactEmail"] },
        financialPlan: { fields: ["description"], populate: { costAndFinance: "*" } },
      },
      filters,
    });
    if (entry.length == 0)
      return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, diese Projektdetails anzuzeigen"));
    entry = entry[0];
    const count = await strapi.db.query("api::project.project").count({
      where: {
        dupFrom: entry.id,
      },
    });
    entry.duplications = count;
    var contactInfo = await strapi
      .controller("api::user-detail.user-detail")
      .getContactPersonInfo(ctx, entry.owner.user_detail.id);
    contactInfo.location = entry.info.location;
    entry.info = contactInfo;
    if (entry.owner.id == ctx.state.user.id) return this.getRequests(entry);
    else return entry;
  },
  async create(ctx) {
    ctx.request.body.data.owner = ctx.state.user;
    let entity = await super.create(ctx);
    return entity;
  },
  async update(ctx) {
    delete ctx.request.body.data.owner;
    const isAdmin = ctx.state.user.role.type === "admin";
    const isArchiveChange = Object.prototype.hasOwnProperty.call(
      ctx.request.body.data,
      "archived"
    );

    if (isArchiveChange && !isAdmin) {
      if (ctx.state.user.role.type !== "leader") {
        return ctx.unauthorized(t(ctx, "Nur die Gemeindeleitung darf Projektideen archivieren."));
      }
      const scopeIds = await this._resolveProjectMunicipalityScope(
        ctx.state.user.id
      );
      if (!scopeIds || scopeIds.length === 0) {
        return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, diese Projektidee zu archivieren. Keine Gemeinde zugewiesen."));
      }
      const entry = await strapi.entityService.findMany(
        "api::project.project",
        {
          filters: {
            id: ctx.params.id,
            municipality: { id: { $in: scopeIds } },
          },
        }
      );
      if (entry.length === 0)
        return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, diese Projektidee zu archivieren."));
      if (ctx.request.body.data.archived === true) {
        await this._cascadeDeletePrioritizedEntry(ctx.params.id);
      }
      return await super.update(ctx);
    }

    let filters = {
      $or: [
        {
          owner: { id: ctx.state.user.id },
        },
        {
          editors: { id: ctx.state.user.id },
        },
      ],
      id: ctx.params.id,
    };
    if (isAdmin) filters = { id: ctx.params.id };
    var entry = await strapi.entityService.findMany("api::project.project", {
      populate: {
        owner: { fields: ["username"] },
      },
      filters,
    });
    if (entry.length == 0)
      return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, diese Projektdetails zu bearbeiten"));
    else {
      if (isArchiveChange && ctx.request.body.data.archived === true) {
        await this._cascadeDeletePrioritizedEntry(ctx.params.id);
      }
      return await super.update(ctx);
    }
  },
  async delete(ctx) {
    if (ctx.state.user.role.type == "admin") {
      await this._cascadeDeletePrioritizedEntry(ctx.params.id);
      return await super.delete(ctx);
    }
    var entry = await strapi.entityService.findMany("api::project.project", {
      populate: {
        owner: { fields: ["username"] },
      },
      filters: {
        owner: { id: ctx.state.user.id },
        id: ctx.params.id,
      },
    });
    if (entry.length == 0)
      return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, dieses Projekt zu löschen"));
    await this._cascadeDeletePrioritizedEntry(ctx.params.id);
    return await super.delete(ctx);
  },
  async getRequests(entry) {
    const requests = await strapi.entityService.findMany(
      "api::request.request",
      {
        fields: ["approved"],
        filters: {
          approved: false,
          project: { id: entry.id },
        },
        populate: {
          user: { fields: "username" },
          project: { fields: ["title"] },
        },
      }
    );
    entry.requests = requests;
    return entry;
  },
  async count(where) {
    const condition = { archived: false, ...where };
    return await strapi.db.query("api::project.project").count({
      where: condition,
    });
  },
  async countArchived() {
    return await strapi.db.query("api::project.project").count({
      where: {
        archived: true,
      },
    });
  },
  async findArchived(ctx) {
    const isAdmin = ctx.state.user.role.type === "admin";
    const isLeader = ctx.state.user.role.type === "leader";
    if (!isAdmin && !isLeader) {
      return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, auf archivierte Projektideen zuzugreifen."));
    }

    const filters = { archived: true };
    if (!isAdmin) {
      const scopeIds = await this._resolveProjectMunicipalityScope(
        ctx.state.user.id
      );
      if (!scopeIds || scopeIds.length === 0) {
        return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, auf archivierte Projektideen zuzugreifen. Keine Gemeinde zugewiesen."));
      }
      filters.municipality = { id: { $in: scopeIds } };
    }

    const entries = await strapi.entityService.findMany(
      "api::project.project",
      {
        fields: ["title", "plannedStart", "plannedEnd"],
        sort: { updatedAt: "desc" },
        filters,
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
          municipality: { fields: ["title", "id"] },
        },
      }
    );
    return entries;
  },
  /**
   * API-token-only endpoint for external systems: lists all non-archived
   * projects with the same fields used for AI funding-match/questions
   * (see src/api/funding/controllers/funding.js proxyMatchFunding).
   */
  async listForScouting(ctx) {
    try {
      const parsedPage = Math.max(parseInt(ctx.query.page, 10) || 1, 1);
      const parsedPageSize = Math.min(
        Math.max(parseInt(ctx.query.pageSize, 10) || 100, 1),
        100
      );

      const [entries, total] = await Promise.all([
        strapi.entityService.findMany("api::project.project", {
          filters: { archived: false },
          fields: ["id", "title"],
          sort: { id: "asc" },
          start: (parsedPage - 1) * parsedPageSize,
          limit: parsedPageSize,
          populate: {
            details: {
              fields: [
                "startingCondition",
                "goals",
                "content",
                "valuesAndBenefits",
              ],
            },
            financialPlan: {
              fields: ["description"],
              populate: { costAndFinance: true },
            },
          },
        }),
        strapi.db.query("api::project.project").count({
          where: { archived: false },
        }),
      ]);

      const data = entries.map((project) => {
        const details = project.details || {};
        const financialPlan = project.financialPlan || {};
        const finances = `${financialPlan.description || ""} ${(
          financialPlan.costAndFinance || []
        )
          .map((item) => `${item.title}: ${item.value} Euro`)
          .join(", ")}`.trim();

        return {
          id: project.id,
          title: project.title,
          startingCondition: details.startingCondition || "",
          goals: details.goals || "",
          content: details.content || "",
          valuesAndBenefits: details.valuesAndBenefits || "",
          finances,
        };
      });

      return {
        data,
        meta: {
          pagination: {
            page: parsedPage,
            pageSize: parsedPageSize,
            total,
            pageCount: Math.ceil(total / parsedPageSize),
          },
        },
      };
    } catch (error) {
      strapi.log.error(error);
      ctx.throw(500, t(ctx, "An internal error occurred. Please try again later."));
    }
  },
  async publicFind() {
    const entries = await strapi.entityService.findMany(
      "api::project.project",
      {
        fields: ["title"],
        filters: {
          $or: [
            {
              visibility: "all users",
            },
            {
              visibility: "listed only",
            },
          ],
          published: true,
          archived: false,
        },
        populate: {
          categories: { fields: ["title"] },
        },
      }
    );
    return entries;
  },
  async duplicateProjectFromRequest(ctx, payload) {
    var ctxlikeObj = {
      state: JSON.parse(JSON.stringify(ctx.state)),
      params: JSON.parse(JSON.stringify(ctx.params)),
    };
    ctxlikeObj.params.id = payload.project.id;
    var project = await this.findOne(ctxlikeObj);
    payload.project = project;
    await this.duplicateProject(ctx, payload);
  },
  async duplicateProjectDirectly(ctx) {
    var userInfo = await strapi
      .controller("api::user-detail.user-detail")
      .find(ctx);
    var payload = {
      user: {
        id: ctx.state.user.id,
        user_detail: userInfo,
      },
    };
    var project = await this.findOne(ctx);
    payload.project = project;
    if (
      project.visibility == "all users" ||
      project.owner.id == ctx.state.user.id
    )
      return await this.duplicateProject(ctx, payload);
    else
      return ctx.unauthorized(t(ctx, "Sie können diese Projektidee nicht duplizieren"));
  },
  async duplicateProject(ctx, payload) {
    var project = payload.project;
    var projectID = payload.project.id;
    project.title =
      `[Duplikat][${payload.user.user_detail.fullName}] ` + project.title;
    project.published = false;
    project.visibility = "only for me";
    project.archived = false;
    project.owner = payload.user.id;
    // Landkreis-only users have no single municipality of their own; keep the
    // original project's municipality in that case instead of crashing.
    if (payload.user.user_detail.municipality) {
      project.municipality = payload.user.user_detail.municipality.id;
    } else if (project.municipality && project.municipality.id) {
      project.municipality = project.municipality.id;
    }
    var keys = [
      "createdAt",
      "updatedAt",
      "editors",
      "readers",
      "media",
      "files",
      "id",
      "requests",
    ];
    var except = ["categories", "tags", "fundingGuideline"];
    var project = await this.filterObject(project, keys, except);
    project.dupFrom = { id: projectID };
    try {
      return await strapi.entityService.create("api::project.project", {
        data: project,
      });
    } catch (e) {
      return ctx.badRequest(e);
    }
  },
  async totalDuplications() {
    return await strapi.db.query("api::project.project").count({
      where: {
        dupFrom: {
          id: {
            $notNull: true,
          },
        },
      },
    });
  },
  async filterObject(obj, keys, except) {
    for (var i in obj) {
      if (!obj.hasOwnProperty(i) || except.includes(i)) continue;
      if (
        obj[i] != null &&
        typeof obj[i] == "object" &&
        !Array.isArray(obj[i])
      ) {
        await this.filterObject(obj[i], keys, except);
      } else if (keys.includes(i) || obj[i] == null) {
        delete obj[i];
      } else if (Array.isArray(obj[i])) {
        for (const ele of obj[i]) {
          await this.filterObject(ele, keys, except);
        }
      }
    }
    return obj;
  },
  async hasEditRole(ctx) {
    const project = await this.findOne(ctx);
    if (
      project.editors.includes(ctx.state.user.id) ||
      project.owner.id == ctx.state.user.id
    )
      return true;
    else return false;
  },
  async projectDashboardStat(ctx) {
    try {
      const {
        municipality,
        status: statusParam,
        investive: detailsInvestive,
        categories,
        tags,
        search,
        location,
        applicationStep,
      } = ctx.query;

      const baseFilters = this._buildBaseFilters(ctx.state.user);
      const isAdmin = ctx.state.user.role.type === 'admin';

      if (!isAdmin) {
        const scopeIds = await this._resolveProjectMunicipalityScope(
          ctx.state.user.id
        );

        if (!scopeIds || scopeIds.length === 0) {
          return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, auf diese Projekte zuzugreifen. Keine Gemeinde zugewiesen."));
        }

        if (!baseFilters.$and) baseFilters.$and = [];
        baseFilters.$and.push({ municipality: { id: { $in: scopeIds } } });
      }

      // applicationStep is filtered in JS after fetch (Strapi doesn't support JSON field queries natively)
      this._applyCustomFilters(baseFilters, {
        municipality: isAdmin ? municipality : undefined,
        status: statusParam,
        detailsInvestive,
        categories,
        tags,
        search,
        location,
      });

      if (ctx.state.user.role.type === "guest") {
        await this._applyGuestLocationFilter(baseFilters, ctx.state.user.id);
      }

      let allProjects = await strapi.entityService.findMany(
        "api::project.project",
        {
          filters: baseFilters,
          populate: {
            financialPlan: {
              populate: {
                costAndFinance: true
              }
            }
          }
        }
      );

      if (applicationStep) {
        const stepNames = applicationStep.includes(',')
          ? applicationStep.split(',').filter(Boolean)
          : [applicationStep];

        // A project matches a step if that step is done but all subsequent steps are not.
        // stepOrder defines the pipeline sequence used to determine "subsequent".
        const stepOrder = ['aiFundingCheck', 'projectDevelopment', 'application'];

        allProjects = allProjects.filter(project => {
          if (!project.applicationProcessSteps || !Array.isArray(project.applicationProcessSteps)) {
            return false;
          }

          return stepNames.some(targetStepName => {
            const targetStepIndex = stepOrder.indexOf(targetStepName);
            if (targetStepIndex === -1) return false;

            const targetStep = project.applicationProcessSteps.find(step => step.name === targetStepName);
            if (!targetStep || !targetStep.done) return false;

            for (let i = targetStepIndex + 1; i < stepOrder.length; i++) {
              const subsequentStep = project.applicationProcessSteps.find(step => step.name === stepOrder[i]);
              if (subsequentStep && subsequentStep.done) return false;
            }

            return true;
          });
        });
      }

      const activeFilters = JSON.parse(JSON.stringify(baseFilters));
      const totalFilters = JSON.parse(JSON.stringify(baseFilters));

      // When no status filter is provided: active = inProgress (null), total excludes rejectionNotice
      if (!statusParam) {
        if (!activeFilters.$and) activeFilters.$and = [];
        activeFilters.$and.push({ status: null });

        if (!totalFilters.$and) totalFilters.$and = [];
        totalFilters.$and.push({
          $or: [{ status: null }, { status: { $in: ["sentToFunding", "grantNotice"] } }]
        });
      }

      let totalProjects, activeProjects;

      if (applicationStep) {
        const filteredForTotal = allProjects.filter(project => {
          if (statusParam) return true;
          return project.status === null || project.status === "sentToFunding" || project.status === "grantNotice";
        });
        const filteredForActive = allProjects.filter(project => {
          if (statusParam) return true;
          return project.status === null;
        });
        totalProjects = filteredForTotal.length;
        activeProjects = filteredForActive.length;
      } else {
        totalProjects = await this.count(totalFilters);
        activeProjects = await this.count(activeFilters);
      }

      const financialSums = {
        gesamtinvestition: 0,
        foerdermittel: 0,
        Eigenmittel: 0,
        Drittmittel: 0
      };

      allProjects.forEach(project => {
        // Exclude rejectionNotice from financial sums when no explicit status filter is set
        if (!statusParam) {
          if (project.status !== null && project.status !== "sentToFunding" && project.status !== "grantNotice") {
            return;
          }
        }

        if (project.financialPlan && project.financialPlan.costAndFinance) {
          project.financialPlan.costAndFinance.forEach(item => {
            // Values are stored in German format: dot = thousand separator, comma = decimal
            let numValue = 0;
            if (item.value && item.value !== '') {
              const normalized = item.value.replace(/\./g, '').replace(',', '.');
              numValue = parseFloat(normalized) || 0;
            }

            if (item.title === "Gesamtinvestition") {
              financialSums.gesamtinvestition += numValue;
            } else if (item.title === "Fördermittel") {
              financialSums.foerdermittel += numValue;
            } else if (item.title === "Eigenmittel") {
              financialSums.Eigenmittel += numValue;
            } else if (item.title === "Drittmittel") {
              financialSums.Drittmittel += numValue;
            }
          });
        }
      });

      Object.keys(financialSums).forEach(key => {
        financialSums[key] = new Intl.NumberFormat('de-DE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(financialSums[key]);
      });

      return {
        totalProjects,
        activeProjects,
        financialSums
      };
    } catch (error) {
      strapi.log.error(error);
      ctx.throw(500, t(ctx, "An internal error occurred. Please try again later."));
    }
  },

  async getApplicationProcess(ctx) {
    try {
      const {
        municipality,
        status,
        investive: detailsInvestive,
        categories,
        tags,
        search,
        location,
        applicationStep,
      } = ctx.query;

      const queryOptions = {
        fields: ["id", "title", "status", "applicationProcessSteps", "fundingMatches"],
        sort: 'updatedAt:desc',
        populate: {}
      };

      const baseFilters = this._buildBaseFilters(ctx.state.user);
      const isAdmin = ctx.state.user.role.type === 'admin';

      const prioritizedEntries = await strapi.entityService.findMany(
        "api::prioritized-project.prioritized-project",
        { fields: ["id"], populate: { project: { fields: ["id"] } } }
      );
      const prioritizedProjectIds = prioritizedEntries
        .filter((e) => e.project)
        .map((e) => e.project.id);
      if (prioritizedProjectIds.length > 0) {
        if (!baseFilters.$and) baseFilters.$and = [];
        baseFilters.$and.push({ id: { $notIn: prioritizedProjectIds } });
      }

      if (!isAdmin) {
        const scopeIds = await this._resolveProjectMunicipalityScope(
          ctx.state.user.id
        );

        if (!scopeIds || scopeIds.length === 0) {
          return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, auf diese Projekte zuzugreifen. Keine Gemeinde zugewiesen."));
        }

        if (!baseFilters.$and) baseFilters.$and = [];
        baseFilters.$and.push({ municipality: { id: { $in: scopeIds } } });
      }

      // applicationStep is filtered in JS after fetch (Strapi doesn't support JSON field queries natively)
      this._applyCustomFilters(baseFilters, {
        municipality: isAdmin ? municipality : undefined,
        status,
        detailsInvestive,
        categories,
        tags,
        search,
        location,
      });

      if (ctx.state.user.role.type === "guest") {
        await this._applyGuestLocationFilter(baseFilters, ctx.state.user.id);
      }

      queryOptions.filters = baseFilters;

      let entries = await strapi.entityService.findMany(
        "api::project.project",
        queryOptions
      );

      if (applicationStep) {
        const stepNames = applicationStep.includes(',')
          ? applicationStep.split(',').filter(Boolean)
          : [applicationStep];

        // A project matches a step if that step is done but all subsequent steps are not.
        const stepOrder = ['aiFundingCheck', 'projectDevelopment', 'application'];

        entries = entries.filter(project => {
          if (!project.applicationProcessSteps || !Array.isArray(project.applicationProcessSteps)) {
            return false;
          }

          return stepNames.some(targetStepName => {
            const targetStepIndex = stepOrder.indexOf(targetStepName);
            if (targetStepIndex === -1) return false;

            const targetStep = project.applicationProcessSteps.find(step => step.name === targetStepName);
            if (!targetStep || !targetStep.done) return false;

            for (let i = targetStepIndex + 1; i < stepOrder.length; i++) {
              const subsequentStep = project.applicationProcessSteps.find(step => step.name === stepOrder[i]);
              if (subsequentStep && subsequentStep.done) return false;
            }

            return true;
          });
        });
      }

      return entries;
    } catch (error) {
      strapi.log.error(error);
      ctx.throw(500, t(ctx, "An internal error occurred. Please try again later."));
    }
  },

  async _cascadeDeletePrioritizedEntry(projectId) {
    const entries = await strapi.entityService.findMany(
      "api::prioritized-project.prioritized-project",
      { filters: { project: { id: projectId } }, fields: ["id"] }
    );
    for (const entry of entries) {
      await strapi.entityService.delete(
        "api::prioritized-project.prioritized-project",
        entry.id
      );
    }
  },

  /**
   * Resolves the set of municipality ids a non-admin user is scoped to:
   * their own municipality, or (for a landkreis-level user) every
   * municipality linked to their landkreis. Returns null if neither is set.
   */
  async _resolveProjectMunicipalityScope(userId) {
    const userDetails = await strapi.entityService.findMany(
      "api::user-detail.user-detail",
      {
        filters: { user: { id: userId } },
        populate: {
          municipality: { fields: ["id"] },
          landkreis: { populate: { municipalities: { fields: ["id"] } } },
        },
      }
    );
    const detail = userDetails?.[0];
    if (detail?.municipality) return [detail.municipality.id];
    if (detail?.landkreis) {
      return (detail.landkreis.municipalities || []).map((m) => m.id);
    }
    return null;
  },

  _buildBaseFilters(user) {
    const filters = {
      $or: [
        { owner: { id: user.id } },
        { editors: { id: user.id } },
        { readers: { id: user.id } },
        { visibility: "listed only" },
        { visibility: "all users" },
      ],
      $and: [
        {
          $or: [
            { published: true },
            {
              $and: [
                { published: false },
                { owner: { id: user.id } },
              ],
            },
          ],
        },
        { archived: false },
      ],
    };

    if (user && user.role && user.role.type === "admin") {
      filters.$or.push({ visibility: "only for me" });
    }

    return filters;
  },

  _applyCustomFilters(baseFilters, { municipality, status, detailsInvestive, categories, tags, search, location }) {
    const additionalFilters = [];

    if (search) {
      additionalFilters.push({ title: { $containsi: search } });
    }

    if (location) {
      const locations = location.includes(',') ? location.split(',').filter(Boolean) : [location];
      if (locations.length === 1) {
        additionalFilters.push({ info: { location: locations[0] } });
      } else if (locations.length > 1) {
        additionalFilters.push({ $or: locations.map(loc => ({ info: { location: loc } })) });
      }
    }

    if (municipality) {
      const municipalityIds = municipality.includes(',') ? municipality.split(',').filter(Boolean) : [municipality];
      if (municipalityIds.length === 1) {
        additionalFilters.push({ municipality: { id: municipalityIds[0] } });
      } else if (municipalityIds.length > 1) {
        additionalFilters.push({ municipality: { id: { $in: municipalityIds } } });
      }
    }

    // "inProgress" maps to null in the DB; other values are stored as strings
    if (status !== undefined) {
      const statusValues = status.includes(',') ? status.split(',').filter(Boolean) : [status];

      if (statusValues.length > 0) {
        const statusConditions = [];

        if (statusValues.includes('inProgress')) {
          statusConditions.push({ status: null });
        }

        const stringValues = statusValues.filter(s => s !== 'inProgress');
        if (stringValues.length > 0) {
          statusConditions.push({ status: { $in: stringValues } });
        }

        if (statusConditions.length === 1) {
          additionalFilters.push(statusConditions[0]);
        } else if (statusConditions.length > 1) {
          additionalFilters.push({ $or: statusConditions });
        }
      }
    }

    if (detailsInvestive !== undefined) {
      const investiveValues = detailsInvestive.includes(',') ? detailsInvestive.split(',').filter(Boolean) : [detailsInvestive];
      const booleanValues = investiveValues.filter(v => v === 'true' || v === 'false').map(v => v === 'true');
      if (booleanValues.length > 0) {
        additionalFilters.push({ details: { investive: { $in: booleanValues } } });
      }
    }

    if (categories) {
      const categoryIds = categories.split(',').filter(Boolean);
      if (categoryIds.length > 0) {
        additionalFilters.push({ categories: { id: { $in: categoryIds } } });
      }
    }

    if (tags) {
      const tagIds = tags.split(',').filter(Boolean);
      if (tagIds.length > 0) {
        additionalFilters.push({ tags: { id: { $in: tagIds } } });
      }
    }

    if (additionalFilters.length > 0) {
      if (!baseFilters.$and) {
        baseFilters.$and = [];
      }
      baseFilters.$and.push(...additionalFilters);
    }
  },

  async _applyGuestLocationFilter(baseFilters, userId) {
    const userDetails = await strapi.entityService.findMany(
      "api::user-detail.user-detail",
      {
        filters: { user: { id: userId } },
        populate: { municipality: { fields: ["title", "id"] } },
      }
    );

    if (userDetails && userDetails.length > 0 && userDetails[0].location) {
      if (!baseFilters.$and) {
        baseFilters.$and = [];
      }

      baseFilters.$and.push({
        info: { location: userDetails[0].location }
      });
    }
  },

  async validateApplicationAccess(ctx) {
    try {
      const { id } = ctx.params;
      const loggedInUser = ctx.state.user;
      const isAdmin = ctx.state.user.role.type === 'admin';
      const isGuest = ctx.state.user.role.type === 'guest';

      if (!id) {
        return ctx.badRequest(t(ctx, "Project ID is required"));
      }

      const project = await strapi.entityService.findOne("api::project.project", id, {
        populate: {
          owner: { fields: ["id", "username"] },
          editors: { fields: ["id", "username"] },
          readers: { fields: ["id", "username"] },
          financialPlan: {
            fields: ["id"],
            populate: {
              costAndFinance: true
            }
          },
          info: { fields: ["location"] }
        },
      });

      if (!project) {
        return ctx.notFound(t(ctx, "Project not found"));
      }

      if (isGuest) {
        const userDetails = await strapi.entityService.findMany(
          "api::user-detail.user-detail",
          { filters: { user: { id: loggedInUser.id } } }
        );

        const userLocation = userDetails[0]?.location;
        const projectLocation = project.info?.location;

        if (!userLocation || !projectLocation || userLocation !== projectLocation) {
          return {
            id: project.id,
            accessGranted: false,
            message: "Sie haben keinen Zugriff auf Projekte außerhalb Ihres Standorts."
          };
        }
      }

      if (
        project.visibility === "listed only" &&
        project.owner?.id !== loggedInUser.id &&
        !isAdmin
      ) {
        const hasReaderAccess = project.readers?.some(user => user.id === loggedInUser.id);
        const hasEditorAccess = project.editors?.some(user => user.id === loggedInUser.id);

        if (hasReaderAccess || hasEditorAccess) {
          return {
            id: project.id,
            financialPlan: project.financialPlan,
            accessGranted: true
          };
        } else {
          return {
            id: project.id,
            accessGranted: false,
            message: "Sie benötigen Zugriff, um dieses Projekt anzuzeigen. Bitte stellen Sie eine Anfrage."
          };
        }
      } else {
        return {
          id: project.id,
          financialPlan: project.financialPlan,
          accessGranted: true
        };
      }
    } catch (error) {
      strapi.log.error(error);
      ctx.throw(500, t(ctx, "An internal error occurred. Please try again later."));
    }
  }
}));
