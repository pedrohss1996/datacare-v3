// Migration: Adiciona coluna configuracao para guardar HTML templates e configs extras
exports.up = function(knex) {
  return knex.schema.table('config_indicadores', function(table) {
    table.jsonb('configuracao').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('config_indicadores', function(table) {
    table.dropColumn('configuracao');
  });
};
