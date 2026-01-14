const ldap = require('ldapjs');
require('dotenv').config();

// Função auxiliar: Converte "dc=rassi,dc=local" para "@rassi.local"
function getDomainFromDN(dn) {
    if (!dn) return '';
    return '@' + dn.split(',')
        .map(part => part.replace('dc=', '').trim())
        .join('.');
}

function authenticate(username, password) {
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({
            url: process.env.LDAP_URL,
            timeout: 5000,
            connectTimeout: 10000
        });

        client.on('error', (err) => {
            console.error('Erro de conexão LDAP:', err);
            reject(new Error('Erro de conexão com o servidor de Login'));
        });

        // LÓGICA NOVA:
        // 1. Se o usuário digitou "marlon", vira "marlon@rassi.local"
        // 2. Se digitou "marlon@rassi.local", mantém como está.
        let userPrincipalName = username;
        
        if (!username.includes('@')) {
            const domainSuffix = getDomainFromDN(process.env.AD_BASE_DN); 
            userPrincipalName = `${username}${domainSuffix}`;
        }

        // Tenta logar
        client.bind(userPrincipalName, password, (err) => {
            if (err) {
                // Erro 49 geralmente é senha errada
                console.log(`Falha login para ${userPrincipalName}:`, err.message);
                client.unbind();
                return resolve(false);
            }

            console.log(`Sucesso login: ${userPrincipalName}`);
            client.unbind();
            return resolve(true);
        });
    });
}

module.exports = { authenticate };