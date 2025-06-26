module.exports = ({ env }) => ({
  connection: {
    client: "mysql",
    connection: {
      host: env("DATABASE_HOST"),
      port: env.int("DATABASE_PORT"),
      database: env("DATABASE_NAME"),
      user: env("DATABASE_USERNAME"),
      password: env("DATABASE_PASSWORD"),
      ssl: env.bool("DATABASE_SSL"),
    },
    // pool: {
    //   min: 2,
    //   max: 6,
    //   acquireTimeoutMillis: 300000,
    //   createTimeoutMillis: 300000,
    //   destroyTimeoutMillis: 50000,
    //   idleTimeoutMillis: 300000,
    //   reapIntervalMillis: 10000,
    //   createRetryIntervalMillis: 2000,
    //   propagateCreateError: false,
    // },
  },
});
