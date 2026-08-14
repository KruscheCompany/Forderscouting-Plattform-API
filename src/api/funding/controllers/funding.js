"use strict";

const { t } = require("../../../utils/i18n");
/**
 *  funding controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::funding.funding", ({ strapi }) => ({
  async find(ctx) {
    const isAdmin = ctx.state.user.role.type === "admin";
    let userScope = null;
    if (!isAdmin) {
      userScope = await this._getUserMunicipalityScope(ctx);
      if (!userScope) {
        return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, auf diese Finanzierungen zuzugreifen. Keine Gemeinde zugewiesen."));
      }
    }

    const options = this._buildGetFundingFilters(ctx);
    options.sort = { updatedAt: "DESC" };
    if (!isAdmin) {
      options.filters.$and.push({
        federalStates: { id: { $in: userScope.federalStateIds } },
      });
    }

    let entries = await strapi.entityService.findMany(
      "api::funding.funding",
      options
    );

    if (!isAdmin) {
      entries = entries.filter((entry) => {
        const hasNoScope =
          (!entry.municipalities || entry.municipalities.length === 0) &&
          (!entry.landkreise || entry.landkreise.length === 0);
        if (hasNoScope) return true;
        const matchesMunicipality = (entry.municipalities || []).some(
          (m) =>
            m.id === userScope.municipalityId ||
            userScope.landkreisMunicipalityIds.includes(m.id)
        );
        const matchesLandkreis = (entry.landkreise || []).some(
          (lk) =>
            lk.id === userScope.landkreisId ||
            userScope.landkreisIds.includes(lk.id)
        );
        return matchesMunicipality || matchesLandkreis;
      });
    }

    return entries;
  },
  async _getUserMunicipalityScope(ctx) {
    const userDetails = await strapi.entityService.findMany(
      "api::user-detail.user-detail",
      {
        filters: { user: { id: ctx.state.user.id } },
        populate: {
          municipality: {
            populate: {
              federalStates: { fields: ["id"] },
              landkreise: { fields: ["id"] },
            },
          },
          landkreis: {
            populate: {
              federalStates: { fields: ["id"] },
              municipalities: { populate: { federalStates: { fields: ["id"] } } },
            },
          },
        },
      }
    );
    const detail = userDetails?.[0];
    const municipality = detail?.municipality;
    const landkreis = detail?.landkreis;
    if (!municipality && !landkreis) return null;

    const federalStateIds = new Set();
    (municipality?.federalStates || []).forEach((fs) => federalStateIds.add(fs.id));
    (landkreis?.federalStates || []).forEach((fs) => federalStateIds.add(fs.id));
    // Fall back to the union of the landkreis's own municipalities' federal
    // states, in case the landkreis itself wasn't directly linked to one.
    (landkreis?.municipalities || []).forEach((m) =>
      (m.federalStates || []).forEach((fs) => federalStateIds.add(fs.id))
    );

    return {
      municipalityId: municipality?.id ?? null,
      landkreisId: landkreis?.id ?? null,
      landkreisIds: (municipality?.landkreise || []).map((lk) => lk.id),
      landkreisMunicipalityIds: (landkreis?.municipalities || []).map((m) => m.id),
      federalStateIds: [...federalStateIds],
    };
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
      delete filters.$or;
      delete filters.$and;
    }
    var entry = await strapi.entityService.findMany("api::funding.funding", {
      populate: {
        owner: { fields: ["username"] },
        editors: { fields: ["username"] },
        readers: { fields: ["username"] },
        categories: { fields: ["title"] },
        tags: { fields: ["title", "status"] },
        info: "*",
        details: "*",
        rates: "*",
        links: "*",
        media: "*",
        files: "*",
        fundings: { fields: ["title"] },
        municipality: { fields: ["title", "location"] },
        fundingsLinkedTo: { fields: ["title"] },
        projects: { fields: ["title"] },
        projects: { fields: ["title"] },
        funding_comments: {
          fileds: ["comment"],
          populate: { owner: { fields: ["username"] } },
        },
        federalStates: true,
        municipalities: {
          fields: "*",
          populate: { federalStates: { fields: "*" } },
        }
      },
      filters,
    });
    if (entry.length == 0) {
      const exists = await strapi.entityService.findMany(
        "api::funding.funding",
        { filters: { id: ctx.params.id } }
      );
      if (exists.length == 0) return ctx.notFound(t(ctx, "Finanzierung nicht gefunden"));
      return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, diese Finanzierungsdetails einzusehen"));
    }
    entry = entry[0];
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
    if (ctx.state.user.role.type == "admin") delete filters.$or;
    var entry = await strapi.entityService.findMany("api::funding.funding", {
      populate: {
        owner: { fields: ["username"] },
      },
      filters,
    });
    if (entry.length == 0)
      return ctx.unauthorized(t(ctx, "Sie sind nicht berechtigt, diese Finanzierungsdetails zu bearbeiten"));
    else return await super.update(ctx);
  },
  async getRequests(entry) {
    const requests = await strapi.entityService.findMany(
      "api::request.request",
      {
        fields: ["approved"],
        filters: {
          approved: false,
          funding: { id: entry.id },
        },
        populate: {
          user: { fields: "username" },
          funding: { fields: ["title"] },
        },
      }
    );
    entry.requests = requests;
    return entry;
  },
  async count() {
    return await strapi.db.query("api::funding.funding").count({
      where: {
        archived: false,
      },
    });
  },
  async countArchived() {
    return await strapi.db.query("api::funding.funding").count({
      where: {
        archived: true,
      },
    });
  },
  async findArchived() {
    const entries = await strapi.entityService.findMany(
      "api::funding.funding",
      {
        fields: ["title", "plannedStart", "plannedEnd"],
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
          tags: { fields: ["title", "status"] },
        },
        filters: {
          archived: true,
        },
      }
    );
    return entries;
  },
  async getFundingExpirey(ctx) {
    var forUsers = new Date();
    var forAdmins = new Date();
    var today = new Date();
    forUsers.setDate(forUsers.getDate() + 180);
    forAdmins.setDate(forAdmins.getDate() + 30);

    var filters = {
      $and: [
        { plannedEnd: { $lte: forUsers.toISOString().split("T")[0] } },
        { plannedEnd: { $gte: today.toISOString().split("T")[0] } },
        { archived: false },
        { published: true },
        {
          projects: {
            owner: { id: ctx.state.user.id },
          },
        },
      ],
    };
    if (ctx.state.user.role.type == "admin") {
      filters.$and[0].plannedEnd = {
        $lte: forAdmins.toISOString().split("T")[0],
      };
      filters.$and.pop();
    }
    const entries = await strapi.entityService.findMany(
      "api::funding.funding",
      {
        fields: ["title", "plannedEnd"],
        filters,
        populate: {
          read_notifications: { populate: ["user"] },
        },
        sort: { plannedEnd: "ASC" },
      }
    );
    return entries;
  },
  async publicFind() {
    const entries = await strapi.entityService.findMany(
      "api::funding.funding",
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
  async hasEditRole(ctx) {
    const funding = await this.findOne(ctx);
    if (
      funding.editors.includes(ctx.state.user.id) ||
      funding.owner.id == ctx.state.user.id
    )
      return true;
    else return false;
  },
  _buildGetFundingFilters(ctx) {
    const { withArchived } = ctx.query;
    const getFundingFilters = {
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
      ],
    };
    const options = {
      fields: [
        "title",
        "visibility",
        "published",
        "plannedStart",
        "plannedEnd",
        "updatedAt",
        "applicationEligible"
      ],
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
        tags: { fields: ["title", "status"] },
        municipalities: true,
        federalStates: true,
        landkreise: true
      },
    };
    let newOptions = null;
    if (withArchived == "true") {
      newOptions = { fields: ["title", "archived"] }
      newOptions.populate = {
        categories: { fields: ["title"] },
        tags: { fields: ["title", "status"] },
        municipalities: true,
        federalStates: true,
        landkreise: true,
      };
      newOptions.filters = getFundingFilters;
      newOptions.filters.$and.push({
        $or: [{ archived: false }, { archived: true }],
      });
    } else {
      options.filters = getFundingFilters;
      options.filters.$and.push({
        archived: false,
      });
    }
    return newOptions || options;
  },

  /**
   * Proxy upload endpoint: accepts multipart/form-data from the frontend
   * and forwards it to the external AI API with proper authentication.
   *
   * Expected fields:
   * - data/file: The uploaded file (multipart)
   * - title: Optional title for the file
   * - admin_id: Optional admin ID
   *
   * @param {Object} ctx - Koa context
   * @returns {Object} Response from external AI API
   */
  async proxyUploadFundingFile(ctx) {
    const axios = require('axios');
    const FormData = require('form-data');
    const fs = require('fs');
    const path = require('path');

    let fileStream = null;
    let filePath = null;

    try {
      // Validate environment configuration
      const targetUrl = process.env.AI_ENDPOINT;
      const apiKey = process.env.AI_ENDPOINT_KEY;

      if (!targetUrl || !apiKey) {
        strapi.log.error('AI_ENDPOINT or AI_ENDPOINT_KEY not configured');
        return ctx.internalServerError('External API configuration missing');
      }

      const fullUrl = `${targetUrl}/funding/file`;

      // Extract and validate request fields
      const body = ctx.request.body || {};
      const title = body.title || (body.data && body.data.title) || "";
      const admin_id = body.admin_id || (body.data && body.data.admin_id) || "";

      // Locate uploaded file
      let fileField = null;
      if (ctx.request.files && ctx.request.files.data) {
        fileField = Array.isArray(ctx.request.files.data)
          ? ctx.request.files.data[0]
          : ctx.request.files.data;
      } else if (ctx.request.files && ctx.request.files.file) {
        fileField = Array.isArray(ctx.request.files.file)
          ? ctx.request.files.file[0]
          : ctx.request.files.file;
      }

      if (!fileField) {
        strapi.log.warn('No file uploaded in proxy request');
        return ctx.badRequest(t(ctx, 'No file was uploaded. Please provide a file in the "data" or "file" field.'));
      }

      // Validate file exists and is readable
      filePath = fileField.path || fileField.filepath;
      if (!filePath || !fs.existsSync(filePath)) {
        strapi.log.error('Uploaded file path is invalid or file does not exist:', filePath);
        return ctx.badRequest(t(ctx, "Uploaded file is invalid or cannot be accessed"));
      }

      // Validate file size (optional: add max size limit)
      const stats = fs.statSync(filePath);
      const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
      if (stats.size > MAX_FILE_SIZE) {
        strapi.log.warn(`File too large: ${stats.size} bytes`);
        return ctx.badRequest(
          t(ctx, "File size exceeds maximum allowed size of {mb} MB", {
            mb: MAX_FILE_SIZE / 1024 / 1024,
          })
        );
      }

      // Build multipart form
      const form = new FormData();
      if (title) form.append('title', title);
      if (admin_id) form.append('admin_id', admin_id);

      fileStream = fs.createReadStream(filePath);
      const filename = fileField.name || fileField.filename || path.basename(filePath);
      const contentType = fileField.type || fileField.mimetype || 'application/octet-stream';

      form.append('data', fileStream, {
        filename,
        contentType,
      });

      // Prepare headers
      const headers = form.getHeaders();
      headers['X-API-KEY'] = apiKey;

      // Compute content length asynchronously
      try {
        const length = await new Promise((resolve, reject) =>
          form.getLength((err, len) => (err ? reject(err) : resolve(len)))
        );
        if (length) {
          headers['Content-Length'] = length;
        }
      } catch (lengthError) {
        // If length calculation fails, proceed with chunked transfer encoding
        strapi.log.debug('Could not calculate form length; using chunked transfer', lengthError.message);
      }

      // Log request (sanitized)
      strapi.log.info('Proxying file upload to external AI API', {
        url: fullUrl,
        filename,
        fileSize: stats.size,
        title: title || '(none)',
        admin_id: admin_id || '(none)',
      });

      // Forward request to external API
      const resp = await axios.post(fullUrl, form, {
        headers,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 120000, // 2 minutes
        validateStatus: (status) => status < 600, // Don't throw on 4xx/5xx, handle manually
      });

      // Log response status
      strapi.log.info('External AI API response received', {
        status: resp.status,
        statusText: resp.statusText,
      });

      // Handle non-2xx responses from external API
      if (resp.status >= 400) {
        strapi.log.error('External AI API returned error', {
          status: resp.status,
          data: resp.data,
        });
        return ctx.status = resp.status, ctx.body = {
          error: 'External API error',
          details: resp.data,
          status: resp.status,
        };
      }

      // Return successful response
      ctx.status = resp.status;
      ctx.body = resp.data;

    } catch (err) {
      // Handle different error types
      if (err.code === 'ECONNREFUSED') {
        strapi.log.error('External AI API connection refused', { error: err.message });
        return ctx.serviceUnavailable('External API is unavailable');
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        strapi.log.error('External AI API request timeout', { error: err.message });
        return ctx.requestTimeout('External API request timed out');
      } else if (err.response) {
        // Axios error with response
        strapi.log.error('External AI API error response', {
          status: err.response.status,
          data: err.response.data,
        });
        return ctx.status = err.response.status, ctx.body = {
          error: 'External API error',
          details: err.response.data,
        };
      } else {
        // Generic error
        strapi.log.error('Proxy upload error', {
          error: err.message,
          stack: err.stack,
        });
        return ctx.internalServerError('Failed to proxy upload', {
          error: err.message,
        });
      }
    } finally {
      // Clean up: close file stream if still open
      if (fileStream && !fileStream.destroyed) {
        fileStream.destroy();
      }
    }
  },

  /**
   * Proxy for funding matching: forwards matching parameters to external AI API
   * Expected JSON in body: { startingCondition, goals, content, valuesAndBenefits, finances }
   */
  async proxyMatchFunding(ctx) {
    const axios = require('axios');

    try {
      const target = process.env.AI_ENDPOINT;
      const apiKey = process.env.AI_ENDPOINT_KEY;
      if (!target || !apiKey) {
        strapi.log.error('AI_ENDPOINT or AI_ENDPOINT_KEY not configured for proxyMatchFunding');
        return ctx.internalServerError('External matching API not configured');
      }

      const payload = ctx.request.body || {};

      // Basic validation: ensure at least one meaningful field is present
      const { startingCondition, goals, content, valuesAndBenefits, finances } = payload;
      if (!startingCondition && !goals && !content && !valuesAndBenefits && !finances) {
        return ctx.badRequest(t(ctx, "At least one matching field must be provided"));
      }

      const url = `${target}/funding/matching`;

      strapi.log.info('Proxying funding match request to external AI API', { url });

      const resp = await axios.post(url, { startingCondition, goals, content, valuesAndBenefits, finances }, {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
        validateStatus: (s) => s < 600,
      });

      // Log non-2xx responses
      if (resp.status >= 400) {
        strapi.log.error('External matching API returned error', { status: resp.status, data: resp.data });
        ctx.status = resp.status;
        ctx.body = { error: 'External matching API error', details: resp.data };
        return;
      }

      // Success: forward response body
      ctx.status = resp.status;
      ctx.body = resp.data;
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        strapi.log.error('proxyMatchFunding connection refused', err.message);
        return ctx.serviceUnavailable('External matching API unavailable');
      }
      if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        strapi.log.error('proxyMatchFunding timeout', err.message);
        return ctx.requestTimeout('External matching API timed out');
      }
      if (err.response) {
        strapi.log.error('proxyMatchFunding external response error', { status: err.response.status, data: err.response.data });
        ctx.status = err.response.status;
        ctx.body = { error: 'External matching API error', details: err.response.data };
        return;
      }

      strapi.log.error('proxyMatchFunding unexpected error', err.stack || err.message);
      return ctx.internalServerError('Failed to proxy matching request');
    }
  },

  /**
   * Proxy for funding questions: forwards question-generation parameters to external AI API
   * Endpoint: POST {AI_ENDPOINT}/funding/questions/:fundingId
   * Expected JSON body: { idea, goals, content, valuesAndBenefits, finances }
   */
  async proxyGetFundingQuestions(ctx) {
    const axios = require('axios');

    try {
      const target = process.env.AI_ENDPOINT;
      const apiKey = process.env.AI_ENDPOINT_KEY;
      if (!target || !apiKey) {
        strapi.log.error('AI_ENDPOINT or AI_ENDPOINT_KEY not configured for proxyGetFundingQuestions');
        return ctx.internalServerError('External questions API not configured');
      }

      const fundingId = ctx.params && ctx.params.fundingId;
      if (!fundingId) {
        return ctx.badRequest(t(ctx, "Missing fundingId in request path"));
      }

      const payload = ctx.request.body || {};
      const { idea, goals, content, valuesAndBenefits, finances } = payload;

      // Basic validation: ensure at least one field is present
      if (!idea && !goals && !content && !valuesAndBenefits && !finances) {
        return ctx.badRequest(t(ctx, "At least one input field must be provided"));
      }

      const url = `${target.replace(/\/$/, '')}/funding/questions/${encodeURIComponent(fundingId)}`;

      strapi.log.info('Proxying funding questions request to external AI API', { url });

      const resp = await axios.post(url, { idea, goals, content, valuesAndBenefits, finances }, {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
        validateStatus: (s) => s < 600,
      });

      if (resp.status >= 400) {
        strapi.log.error('External questions API returned error', { status: resp.status, data: resp.data });
        ctx.status = resp.status;
        ctx.body = { error: 'External questions API error', details: resp.data };
        return;
      }

      // Expecting response.data.questions — but forward whole body so frontend can pick fields
      ctx.status = resp.status;
      ctx.body = resp.data;
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        strapi.log.error('proxyGetFundingQuestions connection refused', err.message);
        return ctx.serviceUnavailable('External questions API unavailable');
      }
      if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        strapi.log.error('proxyGetFundingQuestions timeout', err.message);
        return ctx.requestTimeout('External questions API timed out');
      }
      if (err.response) {
        strapi.log.error('proxyGetFundingQuestions external response error', { status: err.response.status, data: err.response.data });
        ctx.status = err.response.status;
        ctx.body = { error: 'External questions API error', details: err.response.data };
        return;
      }

      strapi.log.error('proxyGetFundingQuestions unexpected error', err.stack || err.message);
      return ctx.internalServerError('Failed to proxy questions request');
    }
  },

  // External AI/Vendor funding creation endpoint
  async createExternalFunding(ctx) {
    const haukeEmail = 'hauke.kluender@amt-vioel.de'
    try {
      const { data } = ctx.request.body;
      const { admin_id } = data || {};

      let defaultAdmin = null;

      // If admin_id is provided, use that specific admin
      if (admin_id) {
        const adminUsers = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            fields: ["id", "username", "email"],
            filters: {
              id: admin_id,
              role: { type: "admin" }
            },
            populate: {
              user_detail: {
                populate: {
                  municipality: { fields: ["id", "title"] }
                }
              }
            },
            limit: 1
          }
        );
        defaultAdmin = adminUsers?.[0];

        if (!defaultAdmin) {
          throw new Error(`Admin user with ID ${admin_id} not found`);
        }
      } else {
        // Query for the specific admin user by email
        const adminUsers = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            fields: ["id", "username", "email"],
            filters: {
              role: { type: "admin" },
              email: haukeEmail
            },
            populate: {
              user_detail: {
                populate: {
                  municipality: { fields: ["id", "title"] }
                }
              }
            },
            limit: 1
          }
        );

        // If specific admin not found, get any admin user
        defaultAdmin = adminUsers?.[0];
        if (!defaultAdmin) {
          const fallbackAdmins = await strapi.entityService.findMany(
            "plugin::users-permissions.user",
            {
              fields: ["id", "username", "email"],
              filters: {
                role: { type: "admin" }
              },
              populate: {
                user_detail: {
                  populate: {
                    municipality: { fields: ["id", "title"] }
                  }
                }
              },
              limit: 1,
              sort: { id: "asc" }
            }
          );
          defaultAdmin = fallbackAdmins?.[0];
        }

        if (!defaultAdmin) {
          throw new Error("No admin users found in the system");
        }
      }

      // Get the municipality from the admin user
      const defaultMunicipality = defaultAdmin.user_detail?.municipality;
      if (!defaultMunicipality) {
        throw new Error("Default admin user has no municipality assigned");
      }

      // Set default values for external funding creation
      const externalFundingData = {
        ...data,
        visibility: "only for me", // Default visibility for external funding
        owner: {
          id: defaultAdmin.id
        }, // Dynamic admin user as owner
        municipality: {
          id: defaultMunicipality.id
        }, // Dynamic municipality from first admin user
        published: true,
        tags: data.tags || [],
        categories: data.categories || [],
        provider: data.provider || "external", // Default provider for external funding
        plannedEnd: (() => {
          const oneYearFromNow = new Date();
          oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
          return oneYearFromNow.toISOString().split("T")[0];
        })(), // Default planned end date - one year from now
      };

      // Create the funding entry
      const entity = await strapi.entityService.create(
        "api::funding.funding",
        {
          data: externalFundingData,
        }
      );

      // Log successful creation
      strapi.log.info(`External funding created successfully with ID: ${entity.id}`);

      // Return only the ID and success message
      return {
        success: true,
        message: "External funding created successfully",
        id: entity.id
      };
    } catch (error) {
      strapi.log.error('External funding creation failed:', error);
      return ctx.badRequest(t(ctx, 'Failed to create external funding'), { error: error.message });
    }
  },
}));
