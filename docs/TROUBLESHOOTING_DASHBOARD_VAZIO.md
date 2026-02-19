# 🔧 Troubleshooting: Dashboard Sem Dados

## Problema
Dashboard gerado pela IA aparece sem dados (KPIs vazios, gráficos vazios).

## ✅ Soluções Implementadas

### 1. Injeção de Dados Melhorada
- ✅ Fallback automático se IA não usar `{{DB_DATA}}`
- ✅ Múltiplos métodos de inicialização
- ✅ Logs de debug no console

### 2. Verificações no Console do Navegador

Abra o Console (F12) e verifique:

```javascript
// Deve aparecer:
✅ [Dashboard] Dados carregados: X registros
📊 [Dashboard] Primeiro registro: {...}
🚀 [Dashboard] Chamando initDashboard()...
```

**Se não aparecer:**
- Os dados não foram injetados
- Verifique a resposta do backend

### 3. Verificar window.DB_DATA

No console do navegador, digite:

```javascript
window.DB_DATA
```

**Esperado:** Array com dados
**Se for `undefined` ou `[]`:** Dados não foram injetados

### 4. Verificar initDashboard()

No console:

```javascript
typeof window.initDashboard
```

**Esperado:** `"function"`
**Se for `"undefined"`:** A IA não gerou a função

---

## 🔍 Debug Passo a Passo

### Passo 1: Verificar Resposta do Backend

1. Abra DevTools (F12)
2. Vá em **Network**
3. Procure a requisição `/api/analytics/preview` ou `/api/analytics/init`
4. Veja a resposta JSON

**Verifique:**
- `success: true`
- `rawResult: [...]` (deve ter dados)
- `previewHtml: "..."` (deve ter HTML)

### Passo 2: Verificar HTML Gerado

No HTML retornado, procure por:

```html
<script>
window.DB_DATA = [...];  // ← Deve existir
</script>
```

**Se não existir:** O fallback não funcionou

### Passo 3: Verificar Placeholder

No HTML gerado pela IA, procure por:

```html
{{DB_DATA}}  // ← Placeholder que será substituído
```

**Se não existir:** A IA não seguiu as instruções

---

## 🛠️ Correções Manuais

### Se window.DB_DATA estiver vazio:

```javascript
// No console do navegador, injete manualmente:
window.DB_DATA = [
  { COLUNA1: 'valor1', COLUNA2: 100 },
  { COLUNA1: 'valor2', COLUNA2: 200 }
];

// Depois chame:
if (typeof window.initDashboard === 'function') {
  window.initDashboard();
}
```

### Se initDashboard não existir:

A IA não gerou a função. Regere o dashboard com prompt mais específico:

```
"Gere um dashboard completo com função initDashboard() que processe window.DB_DATA e renderize KPIs e gráficos"
```

---

## 📋 Checklist de Verificação

- [ ] Backend retornou `success: true`
- [ ] `rawResult` tem dados (array não vazio)
- [ ] HTML contém `window.DB_DATA = [...]`
- [ ] HTML contém `window.initDashboard = function() {...}`
- [ ] Console mostra logs de inicialização
- [ ] `window.DB_DATA.length > 0` no console
- [ ] `typeof window.initDashboard === 'function'` no console

---

## 🚨 Problemas Comuns

### 1. Query não retorna dados
**Sintoma:** `rawResult: []`
**Solução:** Verifique a query SQL e os filtros

### 2. IA não gerou placeholder
**Sintoma:** HTML sem `{{DB_DATA}}`
**Solução:** Já corrigido com fallback automático

### 3. initDashboard não é chamado
**Sintoma:** Dados existem mas dashboard vazio
**Solução:** Já corrigido com múltiplos métodos de inicialização

### 4. Erro JavaScript
**Sintoma:** Erro no console
**Solução:** Verifique o código gerado pela IA

---

## 💡 Dicas

1. **Sempre verifique o console** primeiro
2. **Use logs de debug** para rastrear o problema
3. **Teste com dados pequenos** primeiro (10-20 registros)
4. **Regere o dashboard** se necessário com prompt mais específico
