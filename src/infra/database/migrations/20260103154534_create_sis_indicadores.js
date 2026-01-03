exports.up = function(knex) {
  return knex.schema.createTable('sis_indicadores', function(table) {
    table.increments('id').primary();
    table.string('titulo').notNullable(); 
    table.string('descricao'); 
    table.text('consulta_sql').notNullable(); // O SQL que vamos rodar
    table.string('tipo_grafico').defaultTo('bar'); // bar, line, pie, area
    table.json('configuracao').defaultTo('{}'); // Cores, eixos, etc
    table.string('grupo_modulo').defaultTo('Geral');
    table.boolean('ativo').defaultTo(true);
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('sis_indicadores');
};