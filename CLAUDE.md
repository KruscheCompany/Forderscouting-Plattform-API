# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the backend API for the **Förderscouting-Plattform** — a funding scouting platform for German municipalities. It is a **Strapi 4.21.0** application using **MySQL** as the database. The platform helps municipalities discover, manage, and apply for funding opportunities (Fördermittel) and track project ideas.

## Commands

```bash
# Development (with auto-reload)
yarn dev

# Production start (requires prior build)
yarn build && yarn start

# Config sync (strapi-plugin-config-sync)
yarn cs export   # export DB config to config/sync/
yarn cs import   # import config/sync/ into DB
```

Node.js >=18 <=20 is required. Use Yarn (not npm) to match the lockfile.

## Architecture

### Strapi Structure

Each entity in `src/api/` follows the standard Strapi pattern:
```
src/api/<entity>/
  content-types/<entity>/schema.json   # Data model
  controllers/<entity>.js              # Custom business logic
  routes/<entity>.js                   # Route definitions
  services/<entity>.js                 # (mostly default)
```

All controllers extend Strapi's `createCoreController` with heavily customized `find`, `findOne`, `create`, `update`, and `delete` methods to enforce access control manually (Strapi's built-in policies are not used — all authorization is done in controller code).

### Core Entities

- **`funding`** — Funding opportunities (Fördermittel). Key fields: `title`, `published`, `archived`, `visibility`, `plannedEnd`, `fundingOpen`, `owner`, `editors`, `readers`, `municipalities`, `federalStates`. Funding auto-archives via daily cron when `plannedEnd` has passed (and `fundingOpen != true`).
- **`project`** — Project ideas created by municipalities. Key fields: `title`, `published`, `archived`, `visibility`, `status` (`sentToFunding | grantNotice | rejectionNotice`), `applicationProcessSteps` (JSON), `fundingMatches` (JSON), `financialPlan` (component), `owner`, `editors`, `readers`, `municipality`. Projects can be duplicated via the `duplicateProject` flow.
- **`municipality`** — German municipality (Gemeinde). Links to projects, users, and federal states.
- **`federal-state`** — German federal state (Bundesland).
- **`user-detail`** — Extended user profile (1:1 with `plugin::users-permissions.user`). Contains `fullName`, `municipality`, `notifications` (app + email preferences), `phone`, `postalCode`, `streetNo`.
- **`request`** — Access requests from users (view/edit/duplicate) for projects or fundings. Approval inserts directly into join tables via raw SQL.
- **`watchlist`** — User's saved fundings/projects.
- **`emailing-center`** — Admin bulk email tool (sends BCC to role groups).
- **`guest-request`** — Guest user join requests for municipalities.
- **`read-notification`** — Tracks which users have read a notification (funding expiry, comments, requests).
- **`funding-comment`** — Comments on funding entries.
- **`category`**, **`tag`** — Taxonomies shared across projects and fundings.
- **`translation`**, **`location`** — Supporting content types.

### User Roles

Defined in `config/sync/user-role.*.json`:
- **`admin`** — Full access to all records, bypasses visibility/ownership filters
- **`authenticated`** (leader) — Municipality leader; approves guest access requests for their own municipality
- **`leader`** — Municipality administrator role; sees guest join requests for their municipality
- **`guest`** — Read-only role scoped to a single geographic location (`info.location`)
- **`public`** — Unauthenticated access (limited public endpoints only)

### Authorization Pattern

Authorization is **never** delegated to Strapi's built-in permission layer for data access. Instead, every controller method builds explicit `$or`/`$and` filter objects that encode ownership and visibility rules before calling `strapi.entityService`. Admins bypass these filters (`if (ctx.state.user.role.type == "admin") delete filters.$or`).

Visibility enum (`"only for me" | "all users" | "listed only"`) controls discoverability. Admins additionally see `"only for me"` records.

### AI Integration

The funding controller includes proxy endpoints that forward requests to an external AI service (`AI_ENDPOINT` + `AI_ENDPOINT_KEY`):
- `proxyUploadFundingFile` — Upload a funding document to the AI
- `proxyMatchFunding` — Match a project description against available fundings
- `proxyGetFundingQuestions` — Generate eligibility questions for a specific funding
- `createExternalFunding` — Create a funding entry from AI-generated data (defaults ownership to a configured admin)

### Cron Tasks (`config/cron-tasks.js`)

Runs daily at midnight:
1. Archives fundings where `plannedEnd <= today`, `published = true`, `archived = false`, and `fundingOpen != true`
2. Sends email notifications to admins (30-day warning) and users (180-day warning) for expiring fundings

### Plugins

- **`@strapi/plugin-documentation`** — OpenAPI docs at `/documentation`
- **`@strapi/plugin-i18n`** — Internationalization (German + English)
- **`@strapi/plugin-sentry`** — Error tracking (production only)
- **`@strapi/provider-email-nodemailer`** — SMTP email via nodemailer
- **`strapi-plugin-config-sync`** — Sync Strapi config (roles, permissions) to `config/sync/` directory
- **`strapi-plugin-transformer`** — Prefixes all API routes with `/api/`
- **`strapi-plugin-entity-relationship-chart`** — Admin panel ER diagram

### File Conversion

`user-detail` controller includes `getFileAsPDF` which converts uploaded documents to PDF via a **Gotenberg** service running locally at `http://localhost:3030/forms/libreoffice/convert`.

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env`. Key vars:

| Variable | Purpose |
|---|---|
| `DATABASE_HOST/PORT/NAME/USERNAME/PASSWORD/SSL` | MySQL connection |
| `APP_KEYS`, `JWT_SECRET`, `ADMIN_JWT_SECRET`, `API_TOKEN_SALT`, `TRANSFER_TOKEN_SALT` | Strapi security |
| `BACKEND_URL_LOCAL` | Public URL of this server |
| `RESET_PWD_PAGE` | Frontend password reset URL |
| `SMTP_HOST/PORT`, `EMAIL_AUTH/PASS`, `DEF_FROM/REPLYTO`, `EC_DEF_FROM` | Email |
| `SENTRY_DSN` | Error tracking (production) |
| `SLACK_HOOK_URL/SLACK_HOOK_PASS` | Slack notifications |
| `AI_ENDPOINT`, `AI_ENDPOINT_KEY` | External AI service for funding matching |

## Versioning

`package.json` `version` in this repo is kept in sync with the FE repo (`Forderscouting-Plattform`) — see that repo's `CLAUDE.md` ("Versioning & Changelog") for the full standard and the `CHANGELOG.md` entry process. Bump this repo's version alongside the FE's whenever a user-facing change ships.

## Code Style

ESLint config in `.eslintrc`:
- 2-space indentation
- Single quotes
- Semicolons required
- `"use strict"` at top of every controller/service file
- No `console` warnings (disabled)

All error messages to end users are in **German** (e.g., `"Sie sind nicht berechtigt..."`).
