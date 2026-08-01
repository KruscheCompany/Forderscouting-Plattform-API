"use strict";

const TABLE = "components_project_details";

async function up(trx) {
  await trx.raw(
    `UPDATE ?? SET goals_and_requirements = TRIM(CONCAT_WS('\n\n---\n\n', NULLIF(project_development_goals, ''), NULLIF(requirements, '')))
     WHERE (project_development_goals IS NOT NULL AND project_development_goals != '')
        OR (requirements IS NOT NULL AND requirements != '')`,
    [TABLE]
  );

  await trx.raw(
    `UPDATE ?? SET guideline_check = TRIM(CONCAT_WS('\n\n---\n\n', NULLIF(guideline_content_check, ''), NULLIF(guideline_form_check, '')))
     WHERE (guideline_content_check IS NOT NULL AND guideline_content_check != '')
        OR (guideline_form_check IS NOT NULL AND guideline_form_check != '')`,
    [TABLE]
  );
}

async function down() {}

module.exports = { up, down };
