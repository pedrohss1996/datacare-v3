/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('config_indicadores', 'slug');
  if (!hasColumn) {
    return knex.schema.table('config_indicadores', (table) => {
        // Adiciona a coluna slug. 
        // Ex: 'faturamento-mensal' (usado na URL)
        table.string('slug').unique(); 
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('config_indicadores', (table) => {
      table.dropColumn('slug');
  });
};