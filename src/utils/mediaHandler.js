const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function baixarMidia(url, tipo) {
    try {
        if (!url) {
            console.error("❌ Erro: URL da mídia veio vazia ou indefinida.");
            return null;
        }

        console.log(`📥 Iniciando download de: ${url}`);

        // 1. Define extensão
        let ext = 'dat';
        if (tipo === 'image') ext = 'jpg';
        if (tipo === 'audio') ext = 'ogg'; // WhatsApp geralmente é ogg/opus
        if (tipo === 'document') ext = 'pdf'; 

        const fileName = `${crypto.randomBytes(16).toString('hex')}.${ext}`;

        // 2. Define caminhos usando a RAIZ do projeto (process.cwd())
        // Isso evita confusão se o arquivo está em /src ou não
        const pastaUploads = path.join(process.cwd(), 'public', 'uploads');
        const absolutePath = path.join(pastaUploads, fileName);
        const relativePath = `/uploads/${fileName}`;

        // 3. 🛡️ GARANTIA: Cria a pasta se ela não existir
        if (!fs.existsSync(pastaUploads)) {
            console.log(`📁 Pasta não encontrada. Criando: ${pastaUploads}`);
            fs.mkdirSync(pastaUploads, { recursive: true });
        }

        // 4. Download
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(absolutePath);

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log(`✅ Arquivo salvo com sucesso em: ${absolutePath}`);
                resolve(relativePath); 
            });
            writer.on('error', (err) => {
                console.error("❌ Erro ao escrever arquivo:", err);
                reject(err);
            });
        });

    } catch (error) {
        console.error("❌ Erro CRÍTICO no download:", error.message);
        return null;
    }
}

module.exports = { baixarMidia };