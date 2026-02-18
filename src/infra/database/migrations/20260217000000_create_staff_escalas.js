exports.up = async function(knex) {
    await knex.schema.createTableIfNotExists('staff_setores', (table) => {
        table.increments('id').primary();
        table.string('ds_setor', 200).notNullable();
        table.integer('qt_min_profissionais').defaultTo(1);
        table.timestamps(true, true);
    });

    await knex.schema.createTableIfNotExists('staff_funcionarios', (table) => {
        table.increments('id').primary();
        table.string('nm_funcionario', 200).notNullable();
        table.integer('id_setor').unsigned().references('id').inTable('staff_setores').onDelete('SET NULL');
        table.string('ds_funcao', 100).defaultTo('Colaborador');
        table.string('ds_turno', 50).defaultTo('12x36');
        table.date('dt_demissao').nullable();
        table.timestamps(true, true);
    });

    await knex.schema.createTableIfNotExists('staff_escala_dias', (table) => {
        table.increments('id').primary();
        table.integer('id_funcionario').unsigned().notNullable().references('id').inTable('staff_funcionarios').onDelete('CASCADE');
        table.integer('ano').notNullable();
        table.integer('mes').notNullable();
        table.integer('dia').notNullable();
        table.string('status', 20).defaultTo('P'); // P=Plantão, F=Folga, FE=Férias, FO=Folga, SU=Suspensão, R=Remanejado, etc
        table.string('ds_ocorrencia', 500).nullable();
        table.jsonb('extra').nullable();
        table.timestamps(true, true);
        table.unique(['id_funcionario', 'ano', 'mes', 'dia']);
    });

    await knex.schema.createTableIfNotExists('staff_remanejamentos', (table) => {
        table.increments('id').primary();
        table.integer('id_funcionario').unsigned().notNullable().references('id').inTable('staff_funcionarios').onDelete('CASCADE');
        table.integer('ano').notNullable();
        table.integer('mes').notNullable();
        table.integer('dia').notNullable();
        table.integer('id_setor_destino').unsigned().references('id').inTable('staff_setores').onDelete('SET NULL');
        table.timestamps(true, true);
    });

    const setoresExistentes = await knex('staff_setores').count('* as c').first();
    if (parseInt(setoresExistentes?.c || 0) === 0) {
        await knex('staff_setores').insert([
            { ds_setor: 'Emergência', qt_min_profissionais: 2 },
            { ds_setor: 'UTI', qt_min_profissionais: 2 },
            { ds_setor: 'Enfermaria', qt_min_profissionais: 1 }
        ]);
        const funcsExistentes = await knex('staff_funcionarios').count('* as c').first();
        if (parseInt(funcsExistentes?.c || 0) === 0) {
            const setores = await knex('staff_setores').select('id', 'ds_setor');
            const idEmerg = setores.find(s => s.ds_setor === 'Emergência')?.id || 1;
            const idUTI = setores.find(s => s.ds_setor === 'UTI')?.id || 2;
            await knex('staff_funcionarios').insert([
                { nm_funcionario: 'Dr. João Silva', id_setor: idEmerg, ds_funcao: 'Médico', ds_turno: '12x36' },
                { nm_funcionario: 'Enf. Maria Santos', id_setor: idEmerg, ds_funcao: 'Enfermeira', ds_turno: '12x36' },
                { nm_funcionario: 'Dr. Pedro Costa', id_setor: idUTI, ds_funcao: 'Médico', ds_turno: '12x36' }
            ]);
        }
    }
};

exports.down = function(knex) {
    return knex.schema
        .dropTableIfExists('staff_remanejamentos')
        .dropTableIfExists('staff_escala_dias')
        .dropTableIfExists('staff_funcionarios')
        .dropTableIfExists('staff_setores');
};
