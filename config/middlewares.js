module.exports = ({ env }) => [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      origin: [
        'https://www.foerderscouting-plattform.de',
        'https://foerderscouting-plattform.de',
        'https://projektkompass-kommune.de',
        'https://www.projektkompass-kommune.de',
        env('CORS_ORIGIN_DEV', 'http://localhost:8080'),
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization'],
      keepHeaderOnError: true,
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
