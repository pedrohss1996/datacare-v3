/**
 * Módulo AI Dashboard - Tabela de dashboards (config JSON da IA)
 */
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('ai_dashboards');
  if (exists) return;

  await knex.schema.createTable('ai_dashboards', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.uuid('dataset_id').notNullable()
      .references('id').inTable('ai_datasets').onDelete('CASCADE');
    table.jsonb('config_json').notNullable().defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_ai_dashboards_dataset
    ON ai_dashboards (dataset_id)
  `).catch(() => {});
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('ai_dashboards');
};
