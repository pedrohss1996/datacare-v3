const ldap = require('ldapjs');
const db = require('../infra/database/connection');
require('dotenv').config();

console.log('--- INICIANDO SINCRONIZAÇÃO ZIMBRA (CORREÇÃO FINAL DE PROMISES) ---');

const client = ldap.createClient({
    url: process.env.LDAP_URL,
    timeout: 0,
    connectTimeout: 10000
});

const LIMITE_SERVIDOR = 50;
const DEEP_SCAN_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

// Bases para varrer (Principal + Intranet)
const BASES_PARA_SCAN = [
    process.env.LDAP_BASE_DN, 
    'ou=people,dc=intranet,dc=arh,dc=com,dc=br'
];

// Helper para ler dados bagunçados do Zimbra
function getLdapValue(entry, attributeName) {
    if (entry.object && entry.object[attributeName]) {
        return Array.isArray(entry.object[attributeName]) ? entry.object[attributeName][0] : entry.object[attributeName];
    }
    if (entry.attributes && Array.isArray(entry.attributes)) {
        const found = entry.attributes.find(a => a.type === attributeName);
        if (found && found.values && found.values.length > 0) return found.values[0];
    }
    return null;
}

const realizarBusca = (baseDn, filtro) => {
    return new Promise((resolve, reject) => {
        const opts = {
            scope: 'sub',
            filter: filtro,
            attributes: ['uid', 'cn', 'displayName', 'mail'],
            sizeLimit: 0, 
            paged: false
        };

        let usuariosEncontrados = 0;
        const promessasDb = [];

        client.search(baseDn, opts, (err, res) => {
            if (err) return resolve({ count: 0, hitLimit: false });

            res.on('searchEntry', (entry) => {
                usuariosEncontrados++;
                
                const uid = getLdapValue(entry, 'uid');
                if (!uid || uid.includes('galsync') || uid.includes('spam') || uid.includes('virus')) return;
                
                const nome = getLdapValue(entry, 'displayName') || getLdapValue(entry, 'cn') || uid;

                // --- A CORREÇÃO MÁGICA ESTÁ AQUI ---
                // Criamos uma função async e a EXECUTAMOS IMEDIATAMENTE [ ()() ]
                // Assim a Promise de verdade vai para o array.
                const operacaoBanco = (async () => {
                    try {
                        const exists = await db('usuarios').where({ nm_usuario: uid }).first();
                        
                        if (exists) {
                            await db('usuarios').where({ cd_usuario: exists.cd_usuario }).update({ ds_usuario: nome });
                            return 1; // Retorna 1 se atualizou
                        } else {
                            await db('usuarios').insert({ 
                                nm_usuario: uid, 
                                ds_usuario: nome, 
                                ds_senha: 'LDAP_AUTH' 
                            });
                            return 1; // Retorna 1 se inseriu
                        }
                    } catch (e) {
                        console.error(`🚨 Erro ao salvar ${uid}: ${e.message}`);
                        return 0;
                    }
                })(); // <--- Os parênteses aqui executam a função agora!

                promessasDb.push(operacaoBanco);
            });

            // Tratamento de erro para não travar (como travou no seu teste anterior)
            res.on('error', (err) => {
                if (err.message !== 'Size Limit Exceeded') {
                    // console.error(`Aviso no filtro ${filtro}:`, err.message);
                }
            });

            res.on('end', async () => {
                // Agora sim o Promise.all vai esperar o banco responder de verdade
                await Promise.all(promessasDb);
                
                const hitLimit = (usuariosEncontrados >= LIMITE_SERVIDOR); 
                resolve({ count: usuariosEncontrados, hitLimit });
            });
        });
    });
};

const syncUsers = async () => {
    const BIND_DN = `uid=marlonfilho,${process.env.LDAP_BASE_DN}`;
    const BIND_PASS = process.env.LDAP_PASS;

    try {
        await new Promise((resolve, reject) => {
            client.bind(BIND_DN, BIND_PASS, (err) => err ? reject(err) : resolve());
        });
        console.log('✅ Autenticado no Zimbra.');
        
        let totalGeral = 0;

        for (const baseAtual of BASES_PARA_SCAN) {
            console.log(`\n📂 Iniciando varredura em: [ ${baseAtual} ]`);
            
            for (const letra1 of DEEP_SCAN_CHARS) {
                // Busca Nível 1 (a*, b*, etc)
                const res1 = await realizarBusca(baseAtual, `(uid=${letra1}*)`);
                
                if (!res1.hitLimit) {
                    if(res1.count > 0) {
                        process.stdout.write(`[${letra1.toUpperCase()}:${res1.count}] `);
                        totalGeral += res1.count;
                    }
                } else {
                    // Busca Nível 2 (aa*, ab*, etc) - Deep Scan
                    process.stdout.write(`\n   > DeepScan '${letra1}*': `);
                    for (const letra2 of DEEP_SCAN_CHARS) {
                        const res2 = await realizarBusca(baseAtual, `(uid=${letra1}${letra2}*)`);
                        if (res2.count > 0) {
                            process.stdout.write('.');
                            totalGeral += res2.count;
                        }
                    }
                    console.log(' OK');
                }
            }
        }

        console.log(`\n\n✅ Sincronização Multi-Domínio Completa!`);
        console.log(`👥 Total processado: ${totalGeral}`);
        console.log(`👉 Verifique sua tabela 'usuarios' no banco agora.`);
        
        client.unbind();
        process.exit(0);

    } catch (error) {
        console.error('Falha Geral:', error);
        client.unbind();
        process.exit(1);
    }
};

syncUsers();