exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('usuarios', 'nr_cpf');
  if (!hasColumn) {
    return knex.schema.table('usuarios', (table) => {
      // Adiciona campo CPF na tabela usuarios
      table.string('nr_cpf', 11).nullable();
      
      // Adiciona índice para facilitar buscas
      table.index('nr_cpf');
    });
  }
};

exports.down = function(knex) {
  return knex.schema.table('usuarios', (table) => {
    table.dropColumn('nr_cpf');
  });
};
