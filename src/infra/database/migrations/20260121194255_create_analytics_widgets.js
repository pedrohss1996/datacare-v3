/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('analytics_widgets');
  if (!exists) {
    return knex.schema.createTable('analytics_widgets', (table) => {
      table.increments('id').primary();
      table.string('title', 255).notNullable();
      table.text('description');
      table.text('oracle_sql_query').notNullable();
      table.text('html_template').notNullable();
      table.integer('created_by');
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('analytics_widgets');
};
