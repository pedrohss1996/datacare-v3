const PROFISSOES_PADRAO = [
    'Médico', 'Enfermeiro', 'Técnico de Enfermagem', 'Fisioterapeuta',
    'Fonoaudiólogo', 'Nutricionista', 'Psicólogo', 'Assistente Social',
    'Farmácia', 'Técnico de Laboratório', 'Administrativo', 'Outros'
];

exports.up = async function(knex) {
    await knex.schema.createTableIfNotExists('staff_setor_profissoes', (table) => {
        table.increments('id').primary();
        table.integer('id_setor').unsigned().notNullable().references('id').inTable('staff_setores').onDelete('CASCADE');
        table.string('ds_profissao', 100).notNullable();
        table.integer('qt_minima').defaultTo(0);
        table.timestamps(true, true);
        table.unique(['id_setor', 'ds_profissao']);
    });

    // Popular quantidades mínimas para setores existentes (todos com 0 para que o usuário defina)
    const setores = await knex('staff_setores').select('id');
    for (const s of setores || []) {
        for (const prof of PROFISSOES_PADRAO) {
            const exists = await knex('staff_setor_profissoes')
                .where({ id_setor: s.id, ds_profissao: prof })
                .first();
            if (!exists) {
                await knex('staff_setor_profissoes').insert({
                    id_setor: s.id,
                    ds_profissao: prof,
                    qt_minima: 0
                });
            }
        }
    }
};

exports.down = function(knex) {
    return knex.schema.dropTableIfExists('staff_setor_profissoes');
};
