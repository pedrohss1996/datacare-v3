# 🔧 Troubleshooting - Analytics Builder

## ❌ Problema: "Dashboard criado mas sem dados"

### Sintoma
O Analytics Builder gera o HTML do dashboard corretamente, mas os gráficos aparecem vazios ou com valores zerados.

### Causa Raiz
O Oracle (via Knex + oracledb) está configurado com `fetchAsString: ['number', 'clob']` no `knexfile.js`. Isso faz com que **todos os números retornem como strings** para evitar problemas de precisão.

**Exemplo:**
```javascript
// Oracle retorna:
{ MES: 'Janeiro', TOTAL: '100', MEDIA: '50' }

// Ao invés de:
{ MES: 'Janeiro', TOTAL: 100, MEDIA: 50 }
```

### Solução Implementada ✅

O `AnalyticsController.js` agora **converte automaticamente** strings numéricas para números:

```javascript
data = data.map(row => {
    const newRow = {};
    for (const [key, value] of Object.entries(row)) {
        // Se é string numérica, converte para número
        if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
            newRow[key] = parseFloat(value);
        } else {
            newRow[key] = value;
        }
    }
    return newRow;
});
```

**Resultado:**
```javascript
// Agora os dados ficam corretos:
{ MES: 'Janeiro', TOTAL: 100, MEDIA: 50 }
```

---

## 🧪 Como Testar

### Teste 1: Verificar Conexão Oracle
```bash
node test-analytics-oracle.js
```

**Saída esperada:**
```
✅ Query executada com sucesso!
📊 Dados extraídos:
   Total de registros: 3
   Primeiro registro: { MES: 'Janeiro', TOTAL: 100, MEDIA: 50 }
```

### Teste 2: Query de Teste no Analytics Builder

Use esta query simples:

```sql
SELECT 
    'Janeiro' AS MES,
    100 AS TOTAL,
    50 AS MEDIA
FROM DUAL
UNION ALL
SELECT 'Fevereiro', 150, 75 FROM DUAL
UNION ALL
SELECT 'Março', 200, 100 FROM DUAL
UNION ALL
SELECT 'Abril', 180, 90 FROM DUAL
UNION ALL
SELECT 'Maio', 220, 110 FROM DUAL
UNION ALL
SELECT 'Junho', 250, 125 FROM DUAL
```

**Prompt sugerido:**
```
"Crie um dashboard com 3 KPIs no topo (Total, Média e Máximo) e um gráfico de barras mostrando a evolução por mês"
```

---

## 📊 Queries de Teste Adicionais

Veja o arquivo `docs/QUERY_TESTE_ANALYTICS.sql` para mais exemplos de queries que funcionam perfeitamente.

---

## 🔍 Debug: Verificar Logs

Se ainda houver problemas, verifique os logs do servidor:

```javascript
// No terminal do servidor, você verá:
[Oracle] ✅ Retornou 6 registros
[Oracle] 📊 Primeiro registro: { MES: 'Janeiro', TOTAL: 100, MEDIA: 50 }
[AI-BI] Gerando Dashboard Dinâmico...
```

---

## ⚠️ Problemas Conhecidos

### 1. "Query executada mas não retornou dados"
**Causa:** A query realmente não tem dados ou tem filtros muito restritivos.
**Solução:** 
- Remova filtros de data
- Verifique se as tabelas têm dados
- Use a query de teste com DUAL

### 2. "Erro SQL: ORA-00942: table or view does not exist"
**Causa:** Tabela não existe ou usuário não tem permissão.
**Solução:**
- Verifique o nome da tabela
- Confirme permissões do usuário Oracle
- Use `SELECT * FROM USER_TABLES` para listar tabelas disponíveis

### 3. "Gráficos aparecem mas sem valores"
**Causa:** Conversão de tipos não funcionou.
**Solução:**
- Verifique se os valores são realmente numéricos
- Use `CAST(coluna AS NUMBER)` na query
- Olhe o console do navegador (F12) para ver `window.DB_DATA`

---

## 🎯 Checklist de Validação

Antes de reportar um problema, verifique:

- [ ] Conexão Oracle funciona (`node test-oracle.js`)
- [ ] Query retorna dados no SQL Developer
- [ ] Query tem `FETCH FIRST 200 ROWS ONLY`
- [ ] Colunas numéricas estão sem aspas
- [ ] Query de teste com DUAL funciona
- [ ] Logs do servidor aparecem no terminal
- [ ] Console do navegador (F12) não mostra erros
- [ ] `window.DB_DATA` existe no console (após gerar dashboard)

---

## 📞 Suporte

Se o problema persistir:

1. **Capture os logs:** Copie a saída do terminal do servidor
2. **Teste com DUAL:** Use a query de teste simples
3. **Verifique o console:** Abra F12 e veja o console
4. **Envie a query:** Compartilhe a query SQL que está usando

---

**Última atualização:** 21/01/2026  
**Versão:** 1.0.1
