# Como funciona o CPF no sistema

## 📋 Estrutura atual

### Tabelas envolvidas

**1. pessoa_fisica** (dados pessoais completos)
```
cd_pessoa_fisica (PK)
nr_cpf ← CPF armazenado aqui
nm_pessoa_fisica
nr_identidade
dt_nascimento
...
```

**2. usuarios** (dados de acesso)
```
cd_usuario (PK)
nm_usuario (login)
ds_senha (hash)
cd_pessoa (FK → pessoa_fisica)
nr_cpf ← Coluna opcional (após migration)
...
```

## 🔄 Fluxo de cadastro/edição

### Ao criar/editar um usuário:

1. **Sistema salva CPF em `pessoa_fisica`**
   - Sempre salva o CPF na tabela `pessoa_fisica`
   - Cria vínculo através do campo `cd_pessoa` em `usuarios`

2. **Sistema tenta salvar CPF em `usuarios` (se coluna existir)**
   - Verifica automaticamente se a coluna `nr_cpf` existe
   - Se existir, duplica o CPF para melhor performance
   - Se não existir, ignora silenciosamente

3. **Cria vínculo se não existir**
   - Se o usuário não tem `cd_pessoa` (vínculo com pessoa_fisica)
   - Sistema cria automaticamente um registro em `pessoa_fisica`
   - Atualiza o campo `cd_pessoa` em `usuarios`

## ✅ Como alterar o CPF de um usuário

### Passo a passo:

1. Acesse `/pessoas`
2. Clique em **Editar** no usuário desejado
3. Altere o campo **CPF**
4. Clique em **Salvar Alterações**

### O que acontece nos bastidores:

```javascript
// 1. Remove máscara do CPF
cpfLimpo = "12345678900"

// 2. Verifica se tem vínculo com pessoa_fisica
if (usuario.cd_pessoa existe) {
    // Atualiza pessoa_fisica existente
    UPDATE pessoa_fisica 
    SET nr_cpf = '12345678900' 
    WHERE cd_pessoa_fisica = usuario.cd_pessoa
} else {
    // Cria novo registro em pessoa_fisica
    INSERT INTO pessoa_fisica (nr_cpf, nm_pessoa_fisica, ...)
    // Atualiza o vínculo
    UPDATE usuarios SET cd_pessoa = <novo_id>
}

// 3. Se coluna nr_cpf existir em usuarios (após migration)
UPDATE usuarios 
SET nr_cpf = '12345678900' 
WHERE cd_usuario = id
```

## 🔍 Como verificar se o CPF foi salvo

### SQL direto:

```sql
-- Ver CPF de um usuário específico
SELECT 
    u.cd_usuario,
    u.nm_usuario,
    u.nr_cpf as cpf_usuarios,
    pf.nr_cpf as cpf_pessoa_fisica,
    u.cd_pessoa
FROM usuarios u
LEFT JOIN pessoa_fisica pf ON u.cd_pessoa = pf.cd_pessoa_fisica
WHERE u.nm_usuario = 'marlonfilho';
```

### Via interface:

1. Liste os usuários em `/pessoas`
2. O CPF aparece na coluna "CPF"
3. Se aparecer "Não informado", o CPF não está cadastrado

## ⚠️ Problemas comuns

### "Não consigo alterar o CPF"

**Causa:** Usuário sem vínculo com `pessoa_fisica`

**Solução:** O sistema agora cria automaticamente o vínculo. Basta:
1. Editar o usuário
2. Preencher o CPF
3. Salvar

### "CPF não aparece na listagem"

**Causa:** CPF está em `pessoa_fisica` mas não há vínculo

**Verificação:**
```sql
SELECT cd_usuario, nm_usuario, cd_pessoa 
FROM usuarios 
WHERE cd_pessoa IS NULL;
```

**Solução:** Edite o usuário e salve novamente (o sistema criará o vínculo)

### "CPF aparece mas não funciona no módulo Consultórios"

**Causa:** A coluna `nr_cpf` não existe em `usuarios`

**Solução:** Execute a migration:
```bash
npx knex migrate:latest --knexfile src/infra/database/knexfile.js
```

Ou execute o script manual:
```bash
node scripts/update-user-cpf.js
```

## 💡 Dicas

1. **Sempre use a interface** para cadastrar/editar usuários
2. O sistema garante a integridade dos dados automaticamente
3. O CPF é sempre salvo em `pessoa_fisica` (principal)
4. O CPF em `usuarios` é opcional (otimização)

## 🚀 Após a migration

Quando a migration for executada:

1. Coluna `nr_cpf` será criada em `usuarios`
2. Sistema passará a salvar CPF nas duas tabelas
3. Melhor performance (uma query a menos)
4. Módulo Consultórios funcionará plenamente

**Importante:** O sistema funciona perfeitamente **com ou sem** a migration!
