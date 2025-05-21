module.exports = ({ env }) => ({
  // ...
  email: {
    config: {
      provider: "nodemailer",
      providerOptions: {
        host: env("SMTP_HOST"),
        port: env("SMTP_PORT"),
        auth: {
          user: env("EMAIL_AUTH"),
          pass: env("EMAIL_PASS"),
        },
        // ... any custom nodemailer options
      },
      settings: {
        defaultFrom: env("DEF_FROM"),
        defaultReplyTo: env("DEF_REPLYTO"),
      },
    },
  },
  transformer: {
    enabled: true,
    config: {
      prefix: "/api/",
    },
  },
  "config-sync": {
    enabled: true,
    config: {
      syncDir: "config/sync/",
      minify: true,
      excludedConfig: [
        "core-store.plugin_users-permissions_grant",
        "core-store.plugin_users-permissions_email",
        "core-store.plugin_users-permissions_advanced",
      ],
    },
  },
  sentry: {
    enabled: env("NODE_ENV") === "production",
    config: {
      dsn: env("SENTRY_DSN"),
      sendMetadata: true,
    },
  },
});
