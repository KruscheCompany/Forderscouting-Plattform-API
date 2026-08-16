"use strict";

module.exports = {
  async afterUpdate(event) {
    const { params, result } = event;
    const submittedMatches = params.data && params.data.fundingMatches;
    // fundingCheckSteps is only ever sent alongside fundingMatches by the funding-check
    // submit flow (ProjectFundingCheckCreate.vue's performFundingUpdate) - gating on it
    // too keeps this reconciliation from firing on some other update that happens to
    // round-trip an unchanged fundingMatches array for an unrelated reason.
    if (!Array.isArray(submittedMatches) || submittedMatches.length === 0 || !params.data.fundingCheckSteps) {
      return;
    }

    // Re-evaluated on every submit (not just the first) so a suggestion the user
    // accepted but later deselects, or vice versa, keeps tracking their latest decision.
    // Includes "ignored" here too - a suggestion dismissed via the ignore endpoint never
    // enters fundingMatches in the first place, so its external_id can never match below
    // and it stays untouched; only suggestions actually sitting in the grid (accepted at
    // some point) can ever be re-evaluated here.
    const reconsiderableSuggestions = await strapi.entityService.findMany(
      "api::funding-suggestion.funding-suggestion",
      {
        filters: { project: { id: result.id }, status: { $in: ["notified", "accepted", "ignored"] } },
      }
    );
    if (reconsiderableSuggestions.length === 0) {
      return;
    }

    const submittedByExternalId = new Map(
      submittedMatches
        .filter((match) => match.external_id)
        .map((match) => [parseInt(match.external_id, 10), match])
    );

    for (const suggestion of reconsiderableSuggestions) {
      const submitted = submittedByExternalId.get(suggestion.external_id);
      if (!submitted) continue;
      await strapi.entityService.update(
        "api::funding-suggestion.funding-suggestion",
        suggestion.id,
        { data: { status: submitted.selected ? "accepted" : "ignored" } }
      );
    }
  },
};
