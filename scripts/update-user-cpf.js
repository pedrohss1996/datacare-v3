// Script para atualizar o CPF do usuário marlonfilho
// Uso: node scripts/update-user-cpf.js

require('dotenv').config();
const db = require('../src/infra/database/connection');

async function atualizarCPF() {
    try {
        console.log('🔄 Atualizando CPF do usuário marlonfilho...');
        
        const usuario = 'marlonfilho';
        const cpf = '87209829172';
        
        // Verifica se o usuário existe
        const userExists = await db('usuarios')
            .whereRaw('UPPER(nm_usuario) = ?', [usuario.toUpperCase()])
            .first();
        
        if (!userExists) {
            console.error('❌ Usuário marlonfilho não encontrado no banco!');
            console.log('   Usuários disponíveis:');
            const users = await db('usuarios').select('nm_usuario', 'ds_usuario');
            users.forEach(u => console.log(`   - ${u.nm_usuario} (${u.ds_usuario || 'sem nome'})`));
            process.exit(1);
        }
        
        console.log(`✅ Usuário encontrado: ${userExists.nm_usuario} (${userExists.ds_usuario})`);
        
        // Atualiza o CPF
        await db('usuarios')
            .whereRaw('UPPER(nm_usuario) = ?', [usuario.toUpperCase()])
            .update({
                nr_cpf: cpf,
                dt_atualizacao: new Date()
            });
        
        console.log(`✅ CPF ${cpf} atualizado com sucesso para o usuário ${usuario}!`);
        
        // Verifica a atualização
        const updated = await db('usuarios')
            .whereRaw('UPPER(nm_usuario) = ?', [usuario.toUpperCase()])
            .first();
        
        console.log('\n📋 Dados atualizados:');
        console.log(`   Usuário: ${updated.nm_usuario}`);
        console.log(`   Nome: ${updated.ds_usuario}`);
        console.log(`   CPF: ${updated.nr_cpf}`);
        console.log(`   Situação: ${updated.ie_situacao}`);
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Erro ao atualizar CPF:', error.message);
        console.error(error);
        process.exit(1);
    }
}

atualizarCPF();
