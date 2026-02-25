/**
 * Módulo AI Dashboard - Tabela de conexões Oracle
 */
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('ai_oracle_connections');
  if (exists) return;

  await knex.schema.createTable('ai_oracle_connections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('host').notNullable();
    table.integer('port').notNullable().defaultTo(1521);
    table.string('service_name').notNullable();
    table.string('username').notNullable();
    table.text('password_encrypted').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('ai_oracle_connections');
};
