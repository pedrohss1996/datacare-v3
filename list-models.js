/**
 * Script utilitário para listar modelos disponíveis na API Gemini (Google AI Studio).
 * Contexto: DataCare System Admin / DevTools
 */

// Usando fetch nativo do Node.js 18+
// Se estiver em versão legada, use 'axios' ou 'node-fetch'
const https = require('https');

const API_KEY = 'AIzaSyDp5iMFZffTJWZrKFW3TtklF9NG8NIaDSA';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

if (!API_KEY) {
  console.error('❌ Erro: A variável de ambiente GEMINI_API_KEY não está definida.');
  process.exit(1);
}

async function listGeminiModels() {
  console.log('🔄 Consultando catálogo de modelos do Google AI...');

  try {
    const response = await fetch(`${BASE_URL}?key=${API_KEY}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.models) {
      console.log('⚠️ Nenhum modelo encontrado.');
      return;
    }

    // Filtragem e Organização
    // Focamos em modelos que suportam geração de conteúdo (chat/texto/visão)
    const contentModels = data.models.filter(model => 
      model.supportedGenerationMethods.includes('generateContent')
    );

    console.log(`\n✅ Encontrados ${data.models.length} modelos no total.`);
    console.log(`🔍 Filtrando ${contentModels.length} modelos de Geração de Conteúdo (LLMs):\n`);

    // Exibição em Tabela para facilitar leitura no terminal
    const formattedData = contentModels.map(model => ({
      Name: model.name.replace('models/', ''), // Remove prefixo redundante
      'Display Name': model.displayName,
      'Input Limit': model.inputTokenLimit,
      'Output Limit': model.outputTokenLimit,
      'Knowledge Cutoff': model.version || 'N/A'
    }));

    console.table(formattedData);

    // Dica para Embeddings
    const embeddingModels = data.models.filter(model => 
      model.supportedGenerationMethods.includes('embedContent')
    );
    
    if(embeddingModels.length > 0) {
        console.log(`\nℹ️ Nota: Existem também ${embeddingModels.length} modelos de Embedding disponíveis (ex: ${embeddingModels[0].name.replace('models/', '')}).`);
    }

  } catch (error) {
    console.error('🔥 Falha na requisição:', error.message);
  }
}

// Execução
listGeminiModels();