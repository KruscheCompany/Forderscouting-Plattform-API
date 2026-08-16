'use strict';

/**
 * funding-suggestion router.
 *
 * Default core routes are disabled: this content-type has no ownership scoping,
 * so a `find`/`update` permission granted to it later in Strapi admin would let
 * any authenticated user read/mutate any project's funding suggestions by id.
 * Access only happens through the ownership-checked custom routes on
 * `api::project.project` (listFundingSuggestions / ignoreFundingSuggestion).
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::funding-suggestion.funding-suggestion', {
  only: [],
});
