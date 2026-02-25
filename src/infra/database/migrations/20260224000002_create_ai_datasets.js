/**
 * Módulo AI Dashboard - Tabela de datasets (metadados da query)
 * As tabelas físicas dos dados são ai_dataset_{uuid} criadas dinamicamente.
 */
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('ai_datasets');
  if (exists) return;

  await knex.schema.createTable('ai_datasets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.text('sql_original').notNullable();
    table.uuid('oracle_connection_id').notNullable()
      .references('id').inTable('ai_oracle_connections').onDelete('CASCADE');
    table.timestamp('last_execution');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_ai_datasets_oracle_connection
    ON ai_datasets (oracle_connection_id)
  `).catch(() => {});
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('ai_datasets');
};
