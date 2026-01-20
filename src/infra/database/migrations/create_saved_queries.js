exports.up = function(knex) {
  return knex.schema.createTable('saved_queries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    table.string('title').notNullable();     // Ex: "Pacientes Internados"
    table.text('description');               // Ex: "Lista atual do censo hospitalar"
    table.text('sql_query').notNullable();   // O SQL Base que a IA vai usar
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('saved_queries');
};