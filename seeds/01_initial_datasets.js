exports.seed = async function(knex) {
  // 1. Limpa a tabela antes de inserir (para não duplicar se rodar de novo)
  await knex('saved_queries').del();

  // 2. Insere dados de exemplo
  await knex('saved_queries').insert([
    {
      id: 'd290f1ee-6c54-4b01-90e6-d701748f0851', // UUID fixo para facilitar testes
      title: 'Censo Hospitalar em Tempo Real',
      description: 'Lista de pacientes atualmente internados, com setor e convênio.',
      sql_query: `
        SELECT 
          p.nm_paciente,
          p.dt_entrada,
          p.ds_setor_atendimento,
          p.ds_convenio,
          TRUNC(SYSDATE - p.dt_entrada) as dias_internacao
        FROM 
          atendimento_paciente_v p
        WHERE 
          p.dt_alta IS NULL 
          
      `
    },
    {
      id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
      title: 'Faturamento Mensal por Convênio',
      description: 'Total faturado agrupado por convênio no mês atual.',
      sql_query: `
        SELECT 
          c.ds_convenio,
          SUM(f.vl_conta) as total_faturado,
          COUNT(f.nr_interno_conta) as qtd_contas
        FROM 
          conta_paciente f
          JOIN convenio c ON c.cd_convenio = f.cd_convenio
        WHERE 
          f.DT_PERIODO_FINAL BETWEEN TRUNC(SYSDATE, 'MM') AND LAST_DAY(SYSDATE)
        GROUP BY 
          c.ds_convenio
      `
    }
  ]);
};