const ldap = require('ldapjs');
require('dotenv').config();

const client = ldap.createClient({ url: process.env.LDAP_URL });

const MY_UID = 'marlonfilho'; 

async function debug() {
    // Usando o BASE_DN do .env que já sabemos que funciona para login
    const BIND_DN = `uid=${MY_UID},${process.env.LDAP_BASE_DN}`;
    const BIND_PASS = process.env.LDAP_PASS;

    try {
        await new Promise((resolve, reject) => {
            client.bind(BIND_DN, BIND_PASS, (err) => err ? reject(err) : resolve());
        });
        console.log('✅ Bind OK.');

        // --- Teste 1: Buscando VOCÊ ---
        console.log(`\n--- Teste 1: Buscando uid=${MY_UID} ---`);
        
        client.search(process.env.LDAP_BASE_DN, {
            scope: 'sub',
            filter: `(uid=${MY_UID})`,
            attributes: ['uid', 'cn', 'displayName', 'mail'] // Pedindo atributos explícitos
        }, (err, res) => {
            if(err) console.error('Erro Search:', err);
            
            let achouEu = false;

            res.on('searchEntry', (entry) => {
                achouEu = true;
                console.log('🎯 ACHEI UMA ENTRADA!');
                
                // --- AQUI ESTAVA O ERRO ---
                // Vamos imprimir o objeto inteiro para ver a estrutura
                // Às vezes os dados estão em entry.attributes ou entry.pojo
                try {
                    console.log('DN Direto:', entry.dn.toString());
                    console.log('Atributos:', JSON.stringify(entry.attributes || entry.object));
                } catch (e) {
                    console.log('Erro ao logar detalhes:', e.message);
                    console.log('Entry crua:', entry);
                }
            });
            
            res.on('end', () => {
                if(!achouEu) console.log('❌ Não achei você na busca.');
                
                // --- Teste 2: Wildcard ---
                console.log(`\n--- Teste 2: Buscando Wildcard (uid=*) ---`);
                client.search(process.env.LDAP_BASE_DN, {
                    scope: 'sub',
                    filter: `(uid=*)`,
                    sizeLimit: 5,
                    paged: true // Importante para Zimbra
                }, (err, res2) => {
                    let count = 0;
                    res2.on('searchEntry', (entry) => { 
                        process.stdout.write('.'); 
                        count++; 
                    });
                    res2.on('end', () => {
                        console.log(`\n\nResultado Wildcard: ${count} registros.`);
                        client.unbind();
                    });
                    res2.on('error', (err) => console.log('Erro no stream:', err.message));
                });
            });
        });

    } catch (e) {
        console.error('Erro Fatal:', e);
    }
}

debug();