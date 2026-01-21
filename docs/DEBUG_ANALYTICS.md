# 🐛 Debug Analytics Builder - Passo a Passo

## Problema: "Fica carregando e não mostra nada"

### 🔍 Como Investigar

#### 1. Abra o Console do Navegador (F12)
- No Chrome/Edge: `F12` → Aba `Console`
- Procure por mensagens que começam com `[FRONTEND]`

**O que você deve ver:**
```
🚀 [FRONTEND] sendMessage() chamado
📝 [FRONTEND] Prompt: Crie um dashboard...
💾 [FRONTEND] Active SQL: SELECT...
📡 [FRONTEND] Enviando request para /api/analytics/preview...
```

#### 2. Verifique o Terminal do Servidor
- Olhe o terminal onde o Node.js está rodando
- Procure por mensagens que começam com `[ANALYTICS]` e `[Oracle]`

**O que você deve ver:**
```
========================================
📥 [ANALYTICS PREVIEW] Request recebido
========================================
📝 [ANALYTICS] Prompt: Crie um dashboard...
💾 [ANALYTICS] SQL Query: SELECT...

🔍 [Oracle] Executando query...
✅ [Oracle] Retornou 6 registros

🤖 [AI-BI] Gerando Dashboard com IA...
⏳ [AI-BI] Aguardando resposta da IA (Gemini)...
✅ [AI-BI] IA respondeu!
✅ [ANALYTICS] Respondendo ao frontend...
```

---

## 🚨 Cenários de Erro

### Cenário 1: Nada aparece no Console do Navegador
**Problema:** JavaScript não está sendo executado
**Solução:**
- Verifique se há erros de sintaxe na página
- Recarregue a página com `Ctrl + F5`
- Limpe o cache do navegador

### Cenário 2: Request não chega no servidor
**Sintoma:** Console mostra `📡 Enviando request` mas servidor não recebe
**Causas possíveis:**
- Rota não configurada
- Servidor não está rodando
- Porta diferente

**Solução:**
```bash
# Verifique se o servidor está rodando
# Deve mostrar: Server running on port 3000

# Teste a rota manualmente:
curl -X POST http://localhost:3000/api/analytics/preview \
  -H "Content-Type: application/json" \
  -d '{"prompt":"teste","sqlQuery":"SELECT 1 FROM DUAL"}'
```

### Cenário 3: Erro na query Oracle
**Sintoma:** `❌ [Oracle] Erro na execução`
**Causas possíveis:**
- Tabela não existe
- Sintaxe SQL incorreta
- Sem permissão

**Solução:**
- Use a query de teste com DUAL
- Verifique o erro exato no terminal

### Cenário 4: IA demora muito
**Sintoma:** Fica em `⏳ Aguardando resposta da IA...` por muito tempo
**Causas possíveis:**
- API Key do Gemini inválida
- Limite de quota excedido
- Timeout da rede

**Solução:**
```bash
# Verifique a API Key no .env
echo $GEMINI_API_KEY

# Teste a API Key manualmente:
curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
```

### Cenário 5: HTML gerado mas não renderiza
**Sintoma:** Console mostra `✅ Dashboard gerado` mas tela fica vazia
**Causas possíveis:**
- Erro no HTML gerado pela IA
- Dados não injetados corretamente
- Erro de JavaScript no dashboard

**Solução:**
- Clique no botão "HTML" para ver o código gerado
- Verifique se `window.DB_DATA` existe no console:
  ```javascript
  console.log(window.DB_DATA);
  ```
- Procure por erros no console do navegador

---

## ✅ Checklist de Debug

Marque cada item conforme testa:

- [ ] Servidor está rodando (`npm run dev`)
- [ ] Console do navegador aberto (F12)
- [ ] Terminal do servidor visível
- [ ] Query Oracle testada manualmente
- [ ] API Key do Gemini configurada no `.env`
- [ ] Query selecionada no "Gerenciar Queries"
- [ ] Botão "USAR ESTA QUERY" clicado
- [ ] Indicador verde "Query Ativa" aparecendo
- [ ] Prompt digitado no chat
- [ ] Botão de enviar clicado

---

## 🎯 Teste Rápido

Execute este teste completo:

### 1. Teste a API diretamente

Crie um arquivo `test-analytics-api.js`:

```javascript
const fetch = require('node-fetch');

async function testar() {
    const response = await fetch('http://localhost:3000/api/analytics/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: 'Teste',
            sqlQuery: "SELECT 'Janeiro' AS MES, 100 AS TOTAL FROM DUAL"
        })
    });
    
    const data = await response.json();
    console.log('Response:', data);
}

testar();
```

Execute:
```bash
node test-analytics-api.js
```

**Resultado esperado:**
```json
{
  "success": true,
  "previewHtml": "<!DOCTYPE html>...",
  "metadata": {
    "totalRecords": 1,
    "columns": ["MES", "TOTAL"]
  }
}
```

---

## 📞 Se nada funcionar

1. **Capture os logs completos:**
   - Terminal do servidor (últimas 100 linhas)
   - Console do navegador (copie tudo)

2. **Verifique as variáveis de ambiente:**
   ```bash
   cat .env | grep -E "(GEMINI|ORACLE)"
   ```

3. **Teste o Oracle isoladamente:**
   ```bash
   node test-analytics-oracle.js
   ```

4. **Verifique se a rota existe:**
   ```bash
   grep -r "analytics/preview" src/routes/
   ```

---

**Última atualização:** 21/01/2026
