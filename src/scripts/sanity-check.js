const ldap = require('ldapjs');
const db = require('../infra/database/connection');
require('dotenv').config();

console.log('--- TESTE DE SANIDADE (VERSÃO BLINDADA) ---');

// --- A FUNÇÃO SALVADORA QUE USAREMOS ---
function getLdapValue(entry, attributeName) {
    // 1. Tenta pegar do objeto direto
    if (entry.object && entry.object[attributeName]) {
        return Array.isArray(entry.object[attributeName]) ? entry.object[attributeName][0] : entry.object[attributeName];
    }
    // 2. Tenta varrer os atributos crus (caso o objeto venha vazio)
    if (entry.attributes && Array.isArray(entry.attributes)) {
        const found = entry.attributes.find(a => a.type === attributeName);
        if (found && found.values && found.values.length > 0) return found.values[0];
    }
    return null;
}

async function testeGeral() {
    
    // --- ETAPA 1: TESTE DO BANCO DE DADOS (CRUCIAL) ---
    console.log('\n1. Testando conexão com Banco de Dados...');
    try {
        const testeUser = {
            nm_usuario: 'teste_diagnostico_db',
            ds_usuario: 'Usuario Teste DB',
            ds_senha: '123' 
        };

        // Limpa anterior
        await db('usuarios').where({ nm_usuario: 'teste_diagnostico_db' }).del();

        // Insere novo
        await db('usuarios').insert(testeUser);
        console.log('✅ SUCESSO DB: Inserção direta no SQL funcionou.');

    } catch (error) {
        console.error('❌ FALHA GRAVE NO BANCO DE DADOS (ETAPA 1):');
        console.error(`   Erro: ${error.message}`);
        console.error('   -> Se falhou aqui, o problema é sua tabela SQL ou senha do banco.');
        process.exit(1);
    }

    // --- ETAPA 2: PEGAR 1 USUÁRIO REAL DO ZIMBRA ---
    console.log('\n2. Buscando 1 usuário real no Zimbra para tentar salvar...');
    
    const client = ldap.createClient({ url: process.env.LDAP_URL });
    const BIND_DN = `uid=marlonfilho,${process.env.LDAP_BASE_DN}`;
    
    try {
        await new Promise((resolve, reject) => {
            client.bind(BIND_DN, process.env.LDAP_PASS, (err) => err ? reject(err) : resolve());
        });
        console.log('✅ Bind LDAP OK.');

        // Usando a base da intranet que sabemos que tem gente
        const baseBusca = 'ou=people,dc=intranet,dc=arh,dc=com,dc=br'; 
        
        client.search(baseBusca, {
            scope: 'sub',
            filter: '(uid=*)',
            sizeLimit: 1, // Pega só um
            attributes: ['uid', 'cn', 'displayName']
        }, (err, res) => {
            if (err) console.error('Erro Search:', err);

            let achouAlguem = false;

            res.on('searchEntry', async (entry) => {
                achouAlguem = true;
                
                // --- AQUI ESTAVA O ERRO, AGORA ESTÁ PROTEGIDO ---
                const uid = getLdapValue(entry, 'uid');
                const nome = getLdapValue(entry, 'displayName') || getLdapValue(entry, 'cn') || uid;

                if (!uid) {
                    console.log('⚠️ Entrada encontrada mas sem UID válido. Pulando...');
                    return;
                }

                console.log(`🎯 Encontrei no LDAP: [ ${uid} ] - ${nome}`);

                // Tenta salvar ESTE cara no banco
                try {
                    const exists = await db('usuarios').where({ nm_usuario: uid }).first();
                    
                    if (exists) {
                        console.log(`ℹ️ O usuário ${uid} já existe. Tentando UPDATE...`);
                        await db('usuarios').where({ cd_usuario: exists.cd_usuario }).update({ ds_usuario: nome });
                        console.log('✅ SUCESSO: UPDATE no banco funcionou!');
                    } else {
                        console.log(`✨ Usuário novo. Tentando INSERT...`);
                        await db('usuarios').insert({
                            nm_usuario: uid,
                            ds_usuario: nome,
                            ds_senha: 'LDAP_AUTH'
                        });
                        console.log('✅ SUCESSO: INSERT no banco funcionou!');
                    }
                } catch (dbErr) {
                    console.error('\n❌ ERRO AO SALVAR O USUÁRIO DO LDAP NO BANCO:');
                    console.error(`   Msg: ${dbErr.message}`);
                    // console.error(dbErr); // Descomente para ver o erro completo
                }
            });

            res.on('end', () => {
                setTimeout(() => {
                    if (!achouAlguem) console.log('⚠️ A busca LDAP terminou vazia.');
                    console.log('\n--- FIM DO TESTE ---');
                    client.unbind();
                    process.exit(0);
                }, 1000); // Delayzinho pra garantir que o async do banco termine
            });
        });

    } catch (ldapErr) {
        console.error('Falha LDAP:', ldapErr);
        process.exit(1);
    }
}

testeGeral();