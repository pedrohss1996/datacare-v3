/**
 * Script: Atualiza cd_medico_tasy de um usuário
 * 
 * USO:
 * node scripts/update-user-cd-medico.js <usuario> <cd_medico>
 * 
 * EXEMPLO:
 * node scripts/update-user-cd-medico.js marlonmedico 12345
 */

require('dotenv').config();
const db = require('../src/infra/database/connection');

async function atualizarCdMedico() {
    const usuario = process.argv[2];
    const cdMedico = process.argv[3];

    if (!usuario || !cdMedico) {
        console.error('❌ Uso: node scripts/update-user-cd-medico.js <usuario> <cd_medico>');
        console.error('   Exemplo: node scripts/update-user-cd-medico.js marlonmedico 12345');
        process.exit(1);
    }

    try {
        console.log(`\n🔍 Buscando usuário: ${usuario}`);
        
        const userDb = await db('usuarios')
            .whereRaw('UPPER(nm_usuario) = ?', [usuario.toUpperCase()])
            .first();

        if (!userDb) {
            console.error(`❌ Usuário "${usuario}" não encontrado!`);
            process.exit(1);
        }

        console.log(`✅ Usuário encontrado: ${userDb.ds_usuario || userDb.nm_usuario} (ID: ${userDb.cd_usuario})`);
        console.log(`📝 Atualizando CD_MEDICO_TASY para: ${cdMedico}`);

        await db('usuarios')
            .where('cd_usuario', userDb.cd_usuario)
            .update({
                cd_medico_tasy: parseInt(cdMedico)
            });

        console.log(`✅ CD_MEDICO_TASY atualizado com sucesso!`);
        
        // Verifica
        const userAtualizado = await db('usuarios')
            .where('cd_usuario', userDb.cd_usuario)
            .first();

        console.log(`\n📊 Dados atualizados:`);
        console.log(`   Usuário: ${userAtualizado.nm_usuario}`);
        console.log(`   Nome: ${userAtualizado.ds_usuario || 'N/A'}`);
        console.log(`   CPF: ${userAtualizado.nr_cpf || 'N/A'}`);
        console.log(`   CD_MEDICO_TASY: ${userAtualizado.cd_medico_tasy || 'N/A'}`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

atualizarCdMedico();
