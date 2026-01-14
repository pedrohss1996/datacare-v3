const ldap = require('ldapjs');

// --- DADOS REAIS ---
const USUARIO = 'marlonfilho'; 
const SENHA = 'higino13@'; 
const HOST_IP = '10.0.0.251'; // IP do Zimbra
// -------------------

const client = ldap.createClient({ 
    url: `ldap://${HOST_IP}:389`,
    timeout: 3000,
    connectTimeout: 3000
});

client.on('error', (err) => console.log('ERRO SOCKET:', err.message));

// Vamos testar COMBINAÇÕES de Base e Atributos
const bases = [
    'dc=intranet,dc=arh,dc=com,dc=br', // Com intranet
    'dc=arh,dc=com,dc=br'              // Sem intranet (MUITO COMUM SER ESSE)
];

const pastas = [
    'ou=people',
    'ou=users',
    'cn=users',
    'ou=zimbra'
];

const atributos = ['uid', 'cn'];

async function forcaBruta() {
    console.log('--- INICIANDO DIAGNÓSTICO V2 ---\n');

    for (const base of bases) {
        for (const pasta of pastas) {
            for (const attr of atributos) {
                
                // Monta: uid=marlonfilho,ou=people,dc=arh,dc=com,dc=br
                const dn = `${attr}=${USUARIO},${pasta},${base}`;
                
                process.stdout.write(`Testando: ${dn} ... `);

                try {
                    await new Promise((resolve, reject) => {
                        client.bind(dn, SENHA, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });

                    console.log('\n\n✅✅✅ SUCESSO! ACHEI! ✅✅✅');
                    console.log('Configure seu .env assim:');
                    console.log(`LDAP_BASE_DN=${pasta},${base}`);
                    console.log(`(Seu código deve usar ${attr}=${USUARIO})`);
                    process.exit(0);

                } catch (e) {
                    if (e.code === 'InvalidCredentials') {
                        console.log('⛔ Credenciais Inválidas (Erro 49)');
                    } else if (e.code === 'NoSuchObject') {
                        console.log('❌ Caminho não existe (Erro 32)');
                    } else {
                        console.log(`⚠️ Erro: ${e.message}`);
                    }
                }
            }
        }
    }
    console.log('\n--- FIM DOS TESTES ---');
    console.log('Se tudo deu "Credenciais Inválidas", sua senha está errada ou o usuário está bloqueado.');
    console.log('Se deu "Caminho não existe", a estrutura do LDAP é muito diferente do padrão.');
    client.unbind();
}

forcaBruta();