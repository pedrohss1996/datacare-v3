exports.up = function(knex) {
  return knex.schema.createTable('patients', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('social_name').nullable();
    table.string('cpf', 14).unique().notNullable();
    table.string('cns').nullable(); // Cartão SUS
    table.date('birth_date').notNullable();
    table.string('sex', 1).notNullable(); // M ou F
    table.string('mother_name').notNullable();
    table.string('phone').notNullable();
    table.string('email').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('patients');
};