/**
 * Adiciona coluna html_content para dashboard gerado em HTML pela IA
 */
exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('ai_dashboards', 'html_content');
  if (hasColumn) return;
  await knex.schema.alterTable('ai_dashboards', (table) => {
    table.text('html_content');
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('ai_dashboards', (table) => {
    table.dropColumn('html_content');
  });
};
