"use strict";

/**
 *  project controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::project.project", ({ strapi }) => ({
  async find(ctx) {
    if (ctx.state.user.role.type != "guest") {
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
      // find the current user location in user-detail
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
      // (owner == user|| editors == user || readers == user || visibility == "all users") && (published == true || published == false && owner==user)
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
        // estimatedCosts: "*",
        links: "*",
        media: "*",
        files: "*",
        applicationDecisionFiles: "*",
        fundingGuideline: { fields: ["title"] },
        // checklists: { fields: ["title"] },
        municipality: { fields: ["title", "location"] },
        financialPlan: { fields: ["description"], populate: { costAndFinance: "*" } },
      },
      filters,
    });
    if (entry.length == 0)
      return ctx.unauthorized(
        "Sie sind nicht berechtigt, diese Projektdetails anzuzeigen"
      );
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
    if (ctx.state.user.role.type == "admin") filters = { id: ctx.params.id };
    var entry = await strapi.entityService.findMany("api::project.project", {
      populate: {
        owner: { fields: ["username"] },
      },
      filters,
    });
    if (entry.length == 0)
      return ctx.unauthorized(
        "Sie sind nicht berechtigt, diese Projektdetails zu bearbeiten"
      );
    else return await super.update(ctx);
  },
  async delete(ctx) {
    if (ctx.state.user.role.type == "admin") return await super.delete(ctx);
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
      return ctx.unauthorized(
        "Sie sind nicht berechtigt, dieses Projekt zu löschen"
      );
    else return await super.delete(ctx);
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
  async findArchived() {
    const entries = await strapi.entityService.findMany(
      "api::project.project",
      {
        fields: ["title", "plannedStart", "plannedEnd"],
        filters: {
          archived: true,
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
        },
      }
    );
    return entries;
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
  //dups a project if visibility is set to "all users" or is owner
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
      return ctx.unauthorized("Sie können diese Projektidee nicht duplizieren");
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
    project.municipality = payload.user.user_detail.municipality.id;
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
    var except = ["categories", "tags", "fundingGuideline", "checklists"];
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
      // Extract query parameters for filtering
      const {
        municipality,
        status: statusParam,
        investive: detailsInvestive,
        categories,
        tags,
        search,
        location,
      } = ctx.query;

      // Prepare base filters for access control
      const baseFilters = this._buildBaseFilters(ctx.state.user);

      // Check if user is admin - admins can see all projects
      const isAdmin = ctx.state.user.role.type === 'admin';

      // If not admin, apply municipality filter
      if (!isAdmin) {
        // Get the user's municipality
        const userDetails = await strapi.entityService.findMany(
          "api::user-detail.user-detail",
          {
            filters: { user: { id: ctx.state.user.id } },
            populate: { municipality: { fields: ["id"] } },
          }
        );

        // Check if user has a municipality
        if (!userDetails || userDetails.length === 0 || !userDetails[0].municipality) {
          return ctx.unauthorized(
            "Sie sind nicht berechtigt, auf diese Projekte zuzugreifen. Keine Gemeinde zugewiesen."
          );
        }

        // Add municipality filter since user has a municipality
        const userMunicipalityId = userDetails[0].municipality.id;

        // Add filter for projects in the same municipality as the user
        if (!baseFilters.$and) {
          baseFilters.$and = [];
        }
        baseFilters.$and.push({ municipality: { id: userMunicipalityId } });
      }


      // Apply custom query filters
      this._applyCustomFilters(baseFilters, {
        // municipality parameter is now optional - only used if provided and user is admin
        municipality: isAdmin ? municipality : undefined,
        status: statusParam,
        detailsInvestive,
        categories,
        tags,
        search,
        location,
      });

      // Apply guest-specific location filter if applicable
      if (ctx.state.user.role.type === "guest") {
        await this._applyGuestLocationFilter(baseFilters, ctx.state.user.id);
      }

      // Create separate filter objects to avoid any potential reference issues
      const activeFilters = JSON.parse(JSON.stringify(baseFilters));
      const totalFilters = JSON.parse(JSON.stringify(baseFilters));
      const financialFilters = JSON.parse(JSON.stringify(baseFilters));

      // Apply status filters (if not already set by the query parameters)
      if (!statusParam) {
        // For active projects, only count projects with null status
        if (!activeFilters.$and) activeFilters.$and = [];
        activeFilters.$and.push({ status: null });

        // For total projects, count both null and true status
        if (!totalFilters.$and) totalFilters.$and = [];
        totalFilters.$and.push({
          $or: [{ status: null }, { status: true }]
        });

        // For financial calculations, include all projects (like totalProjects)
        if (!financialFilters.$and) financialFilters.$and = [];
        financialFilters.$and.push({
          $or: [{ status: null }, { status: true }]
        });
      }

      // Count projects
      const totalProjects = await this.count(totalFilters);
      const activeProjects = await this.count(activeFilters);

      // Get financial data for all filtered projects
      const projectsWithFinancialData = await strapi.entityService.findMany(
        "api::project.project",
        {
          filters: financialFilters,
          populate: {
            financialPlan: {
              populate: {
                costAndFinance: true
              }
            }
          }
        }
      );

      // Initialize financial sums
      const financialSums = {
        gesamtinvestition: 0,
        foerdermittel: 0,
        Eigenmittel: 0,
        Drittmittel: 0
      };

      // Calculate sums
      projectsWithFinancialData.forEach(project => {
        if (project.financialPlan && project.financialPlan.costAndFinance) {
          project.financialPlan.costAndFinance.forEach(item => {
            // Handle German format currency values (dot as thousand separator, comma as decimal)
            // First, convert the string value to a proper number
            let numValue = 0;
            if (item.value && item.value !== '') {
              // Remove all dots (thousand separators) and replace comma with dot for decimal
              const normalized = item.value.replace(/\./g, '').replace(',', '.');
              numValue = parseFloat(normalized) || 0;
            }

            // Add to the appropriate sum based on the title
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

      // Format financial sums as German currency format (dot as thousand separator, comma as decimal)
      Object.keys(financialSums).forEach(key => {
        // Format the number using German locale conventions
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
      ctx.throw(500, error.message);
    }
  },

  async getApplicationProcess(ctx) {
    try {
      // Extract query parameters for filtering
      const {
        municipality,
        status,
        investive: detailsInvestive,
        categories,
        tags,
        search, // Extract search parameter for title filtering
        location, // Extract location parameter for filtering by info.location
      } = ctx.query;

      // Define common fields and population options - keeping only necessary fields
      const queryOptions = {
        fields: ["id", "title", "status", "applicationProcessSteps"],
        sort: 'updatedAt:desc',
        populate: {} // No need to populate relations as we only need basic fields
      };

      // Prepare base filters for access control (using the existing method)
      const baseFilters = this._buildBaseFilters(ctx.state.user);

      // Check if user is admin - admins can see all projects
      const isAdmin = ctx.state.user.role.type === 'admin';

      // If not admin, apply municipality filter
      if (!isAdmin) {
        // Get the user's municipality
        const userDetails = await strapi.entityService.findMany(
          "api::user-detail.user-detail",
          {
            filters: { user: { id: ctx.state.user.id } },
            populate: { municipality: { fields: ["id"] } },
          }
        );

        // Check if user has a municipality
        if (!userDetails || userDetails.length === 0 || !userDetails[0].municipality) {
          return ctx.unauthorized(
            "Sie sind nicht berechtigt, auf diese Projekte zuzugreifen. Keine Gemeinde zugewiesen."
          );
        }

        // Add municipality filter since user has a municipality
        const userMunicipalityId = userDetails[0].municipality.id;

        // Add filter for projects in the same municipality as the user
        if (!baseFilters.$and) {
          baseFilters.$and = [];
        }
        baseFilters.$and.push({ municipality: { id: userMunicipalityId } });
      }

      // Apply custom query filters
      this._applyCustomFilters(baseFilters, {
        // municipality parameter is now optional - only used if provided and user is admin
        municipality: isAdmin ? municipality : undefined,
        status,
        detailsInvestive,
        categories,
        tags,
        search, // Pass search term to custom filters
        location, // Pass location parameter for filtering by info.location
      });

      // Apply guest-specific location filter if applicable
      if (ctx.state.user.role.type === "guest") {
        await this._applyGuestLocationFilter(baseFilters, ctx.state.user.id);
      }

      // Apply filters to query options
      queryOptions.filters = baseFilters;

      // Execute query
      const entries = await strapi.entityService.findMany(
        "api::project.project",
        queryOptions
      );

      return entries;
    } catch (error) {
      ctx.throw(500, error.message);
    }
  },

  /**
   * Build base filters for user access control
   * @private
   */
  _buildBaseFilters(user) {
    return {
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
  },

  /**
   * Apply custom filters based on query parameters
   * @private
   */
  _applyCustomFilters(baseFilters, { municipality, status, detailsInvestive, categories, tags, search, location }) {
    const additionalFilters = [];

    // Handle title search filter
    if (search) {
      additionalFilters.push({
        title: {
          $containsi: search // Case-insensitive contains search
        }
      });
    }

    // Handle location filter
    if (location) {
      // Split multiple location values if comma-separated
      const locations = location.includes(',')
        ? location.split(',').filter(Boolean)
        : [location];

      if (locations.length > 0) {
        if (locations.length === 1) {
          additionalFilters.push({
            info: { location: locations[0] }
          });
        } else {
          // For multiple locations, use $or with each location value
          const locationConditions = locations.map(loc => ({
            info: { location: loc }
          }));

          additionalFilters.push({ $or: locationConditions });
        }
      }
    }

    // Handle municipality filter (only for admins who explicitly provided it)
    if (municipality) {
      const municipalityIds = municipality.includes(',')
        ? municipality.split(',').filter(Boolean)
        : [municipality];

      if (municipalityIds.length > 0) {
        if (municipalityIds.length === 1) {
          additionalFilters.push({
            municipality: { id: municipalityIds[0] }
          });
        } else {
          // For multiple municipalities, use $or
          additionalFilters.push({
            municipality: { id: { $in: municipalityIds } }
          });
        }
      }
    }

    // Handle status filter (multiple values)
    if (status !== undefined) {
      const statusValues = status.includes(',')
        ? status.split(',').filter(Boolean)
        : [status];

      if (statusValues.length > 0) {
        const statusConditions = [];

        // Process each status value
        if (statusValues.includes('null')) {
          statusConditions.push({ status: null });
        }

        const booleanValues = statusValues
          .filter(s => s === 'true' || s === 'false')
          .map(s => s === 'true');

        if (booleanValues.length > 0) {
          statusConditions.push({ status: { $in: booleanValues } });
        }

        // If we have multiple status conditions, use $or to combine them
        if (statusConditions.length === 1) {
          additionalFilters.push(statusConditions[0]);
        } else if (statusConditions.length > 1) {
          additionalFilters.push({ $or: statusConditions });
        }
      }
    }

    // Handle details.investive filter (multiple values)
    if (detailsInvestive !== undefined) {
      const investiveValues = detailsInvestive.includes(',')
        ? detailsInvestive.split(',').filter(Boolean)
        : [detailsInvestive];

      if (investiveValues.length > 0) {
        const booleanValues = investiveValues
          .filter(v => v === 'true' || v === 'false')
          .map(v => v === 'true');

        if (booleanValues.length > 0) {
          additionalFilters.push({
            details: { investive: { $in: booleanValues } }
          });
        }
      }
    }

    // Handle categories filter (multiple values)
    if (categories) {
      const categoryIds = categories.split(',').filter(Boolean);
      if (categoryIds.length > 0) {
        additionalFilters.push({
          categories: { id: { $in: categoryIds } }
        });
      }
    }

    // Handle tags filter (multiple values)
    if (tags) {
      const tagIds = tags.split(',').filter(Boolean);
      if (tagIds.length > 0) {
        additionalFilters.push({
          tags: { id: { $in: tagIds } }
        });
      }
    }

    // Add additional filters to the base filters
    if (additionalFilters.length > 0) {
      if (!baseFilters.$and) {
        baseFilters.$and = [];
      }
      baseFilters.$and.push(...additionalFilters);
    }
  },

  /**
   * Apply location filter for guest users
   * @private
   */
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

  /**
   * Validates if a user has access to view application process details
   * Returns project's ID and financialPlan if access is allowed
   */
  async validateApplicationAccess(ctx) {
    try {
      const { id } = ctx.params;
      const loggedInUser = ctx.state.user;
      const isAdmin = ctx.state.user.role.type === 'admin';
      const isGuest = ctx.state.user.role.type === 'guest';

      if (!id) {
        return ctx.badRequest('Project ID is required');
      }

      // Fetch the project with necessary fields for permission checking
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
        return ctx.notFound('Project not found');
      }

      // Location check for guest users
      if (isGuest) {
        // Get the guest user's location
        const userDetails = await strapi.entityService.findMany(
          "api::user-detail.user-detail",
          {
            filters: { user: { id: loggedInUser.id } },
          }
        );

        const userLocation = userDetails[0]?.location;
        const projectLocation = project.info?.location;

        // If guest user's location doesn't match project location, deny access
        if (!userLocation || !projectLocation || userLocation !== projectLocation) {
          return {
            id: project.id,
            accessGranted: false,
            message: "Sie haben keinen Zugriff auf Projekte außerhalb Ihres Standorts."
          };
        }
      }

      // Check if the project has "listed only" visibility
      // AND current user is not the owner
      // AND current user is not an admin
      if (
        project.visibility === "listed only" &&
        project.owner?.id !== loggedInUser.id &&
        !isAdmin
      ) {
        // Check if user has reader or editor access
        const hasReaderAccess = project.readers?.some(user => user.id === loggedInUser.id);
        const hasEditorAccess = project.editors?.some(user => user.id === loggedInUser.id);

        if (hasReaderAccess || hasEditorAccess) {
          // User has access through readers or editors role
          return {
            id: project.id,
            financialPlan: project.financialPlan,
            accessGranted: true
          };
        } else {
          // User does not have access - they need to request it
          return {
            id: project.id,
            accessGranted: false,
            message: "Sie benötigen Zugriff, um dieses Projekt anzuzeigen. Bitte stellen Sie eine Anfrage."
          };
        }
      } else {
        // Access is allowed: for admins, project owners, or if project has other visibility settings
        return {
          id: project.id,
          financialPlan: project.financialPlan,
          accessGranted: true
        };
      }
    } catch (error) {
      ctx.throw(500, error.message);
    }
  }
}));
