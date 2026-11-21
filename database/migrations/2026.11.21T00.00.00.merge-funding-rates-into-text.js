"use strict";

const FUNDINGS = "fundings";
const FUNDING_COMPONENTS = "fundings_components";
const RATES = "components_funding_rates";

const stripHtml = (value) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatRate = ({ amount, content }) => {
  const percent = stripHtml(amount).replace(/\s*%$/, "");
  const text = stripHtml(content);
  if (percent && text) return `${percent} % – ${text}`;
  if (percent) return `${percent} %`;
  return text;
};

// The old input always showed a trailing "%" when the stored value had none,
// so a bare "20" or "Mindestens 15" was displayed as "20%" / "Mindestens 15%".
// The new textarea has no suffix, so make that percent sign part of the text.
const normalizeOwnContribution = (value) => {
  if (value == null) return value;
  const text = /<[^>]+>/.test(value) ? stripHtml(value) : String(value).trim();
  if (text && !text.includes("%") && /\d$/.test(text)) return `${text} %`;
  return text;
};

// Strapi runs custom migrations before it syncs schema.json, so the new
// funding_rates column does not exist yet - create it here. The old `rates`
// component rows are deliberately kept as a backup until the data is verified.
async function up(trx) {
  if (!(await trx.schema.hasTable(FUNDINGS))) return;

  if (!(await trx.schema.hasColumn(FUNDINGS, "funding_rates"))) {
    await trx.schema.alterTable(FUNDINGS, (table) => {
      table.text("funding_rates", "longtext");
    });
  }

  if (
    (await trx.schema.hasTable(FUNDING_COMPONENTS)) &&
    (await trx.schema.hasTable(RATES))
  ) {
    const rows = await trx(`${FUNDING_COMPONENTS} as fc`)
      .join(`${RATES} as r`, "r.id", "fc.component_id")
      .where("fc.component_type", "funding.rates")
      .where("fc.field", "rates")
      .orderBy([
        { column: "fc.entity_id" },
        { column: "fc.order" },
        { column: "r.id" },
      ])
      .select("fc.entity_id", "r.amount", "r.content");

    const linesByFunding = new Map();
    for (const row of rows) {
      const line = formatRate(row);
      if (!line) continue;
      if (!linesByFunding.has(row.entity_id)) linesByFunding.set(row.entity_id, []);
      linesByFunding.get(row.entity_id).push(line);
    }

    for (const [fundingId, lines] of linesByFunding) {
      await trx(FUNDINGS)
        .where({ id: fundingId })
        .whereNull("funding_rates")
        .update({ funding_rates: lines.join("\n") });
    }
  }

  const fundings = await trx(FUNDINGS)
    .whereNotNull("own_contribution")
    .select("id", "own_contribution");
  for (const { id, own_contribution } of fundings) {
    const normalized = normalizeOwnContribution(own_contribution);
    if (normalized !== own_contribution) {
      await trx(FUNDINGS).where({ id }).update({ own_contribution: normalized });
    }
  }
}

async function down() {}

module.exports = { up, down };
