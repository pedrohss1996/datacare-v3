/**
 * Escalas de cor para dashboards AI (paletas salvas)
 */
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('ai_color_scales');
  if (exists) return;
  await knex.schema.createTable('ai_color_scales', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.jsonb('colors').notNullable().defaultTo('[]');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('ai_color_scales');
};
