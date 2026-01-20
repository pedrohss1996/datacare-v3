exports.up = function(knex) {
  return knex.schema.createTable('users', (table) => {
    // ID único gerado automaticamente pelo banco
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Dados cadastrais
    table.string('name').notNullable();
    table.string('email').notNullable().unique();
    table.string('password_hash').notNullable();
    
    // Controle de acesso
    table.string('role').defaultTo('user'); // user, admin
    table.boolean('active').defaultTo(true);
    
    // Datas de controle
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};