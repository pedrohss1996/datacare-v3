/**
 * Índices para otimizar queries frequentes dos indicadores.
 */
exports.up = async function(knex) {
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_config_indicadores_pasta_ativo 
    ON config_indicadores (pasta_id, ativo)
  `).catch(() => {});
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_indicadores_permissoes_pasta_grupo 
    ON indicadores_permissoes (pasta_id, grupo_id)
  `).catch(() => {});
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_config_indicadores_id_ativo 
    ON config_indicadores (id) WHERE ativo = true
  `).catch(() => {});
};

exports.down = async function(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_config_indicadores_pasta_ativo');
  await knex.raw('DROP INDEX IF EXISTS idx_indicadores_permissoes_pasta_grupo');
  await knex.raw('DROP INDEX IF EXISTS idx_config_indicadores_id_ativo');
};
