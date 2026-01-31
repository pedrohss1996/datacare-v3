# Autenticação Híbrida - LDAP + PostgreSQL

## 🔐 Como funciona agora

O sistema possui **dois métodos de autenticação**:

1. **LDAP (Zimbra)** - Para usuários do e-mail corporativo
2. **Senha Local (PostgreSQL)** - Para usuários específicos do DataCare

### 📊 Fluxo de Login

```
┌─────────────────────────────────────────┐
│ Usuário digita: usuario + senha         │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ 1. Busca usuário no PostgreSQL          │
│    SELECT * FROM usuarios                │
│    WHERE nm_usuario = 'marlonmedico'    │
│                                          │
│    ❌ Se não existe → Erro               │
│    ✅ Se existe → Prossegue              │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ 2. Tenta LDAP (Zimbra) PRIMEIRO         │
│    uid=marlonmedico,ou=people,...       │
│                                          │
│    ✅ Se autenticou → LOGIN ✓           │
│    ❌ Se falhou → Tenta próximo passo   │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ 3. Tenta Senha Local (PostgreSQL)       │
│    bcrypt.compare(senha, hash_bd)       │
│                                          │
│    ✅ Se senha correta → LOGIN ✓        │
│    ❌ Se senha errada → ERRO ✗          │
└─────────────────────────────────────────┘
```

## ✅ Vantagens

### Para usuários do Zimbra (marlonfilho)
- ✅ Usa a mesma senha do e-mail
- ✅ Senha única (SSO)
- ✅ Sincronização automática
- ✅ Segurança centralizada

### Para usuários específicos (marlonmedico)
- ✅ Não precisa conta no Zimbra
- ✅ Senha independente
- ✅ Ideal para médicos externos
- ✅ Controle total no DataCare

## 📝 Exemplos de Uso

### Usuário do Zimbra (marlonfilho)

```
Login: marlonfilho
Senha: senha_do_zimbra

1. Busca no PostgreSQL ✅ (existe)
2. Tenta LDAP ✅ (autentica)
3. Login bem-sucedido! 🎉
```

### Usuário Local (marlonmedico)

```
Login: marlonmedico
Senha: senha_cadastrada_no_datacare

1. Busca no PostgreSQL ✅ (existe)
2. Tenta LDAP ❌ (não existe no Zimbra)
3. Tenta senha local ✅ (senha correta)
4. Login bem-sucedido! 🎉
```

### Usuário não cadastrado

```
Login: usuarionovo
Senha: qualquer_senha

1. Busca no PostgreSQL ❌ (não existe)
2. Erro: "Usuário não encontrado" ✗
```

## 🔧 Configuração

### Variáveis de ambiente (.env)

```bash
# LDAP (Zimbra)
LDAP_URL=ldap://seu-servidor-zimbra:389
# ou com SSL:
# LDAP_URL=ldaps://seu-servidor-zimbra:636

# JWT (sessão)
JWT_SECRET=seu-secret-aqui
```

### Estrutura do banco (PostgreSQL)

```sql
CREATE TABLE usuarios (
    cd_usuario SERIAL PRIMARY KEY,
    nm_usuario VARCHAR(100) UNIQUE NOT NULL,  -- Login
    ds_usuario VARCHAR(255),                   -- Nome completo
    ds_senha VARCHAR(255),                     -- Hash bcrypt (opcional)
    nr_cpf VARCHAR(11),                        -- CPF
    ie_situacao CHAR(1) DEFAULT 'A',          -- A=Ativo, I=Inativo
    cd_perfil_inicial INTEGER,                 -- Perfil
    dt_criacao TIMESTAMP DEFAULT NOW()
);
```

## 👥 Gerenciando Usuários

### Criar usuário que usa LDAP (Zimbra)

1. Acesse `/pessoas/novo`
2. Preencha:
   - **Usuário**: nome.sobrenome (igual ao Zimbra)
   - **Senha**: qualquer (não será usada)
   - **Nome**: Nome Completo
   - **CPF**: CPF do médico (se necessário)
3. Salve

**Resultado:** Usuário loga com a senha do Zimbra

### Criar usuário com senha local (sem Zimbra)

1. Acesse `/pessoas/novo`
2. Preencha:
   - **Usuário**: marlonmedico
   - **Senha**: senha_forte_123
   - **Nome**: Dr. Marlon Médico
   - **CPF**: 872.098.291-72
3. Salve

**Resultado:** Usuário loga com a senha cadastrada

## 🔄 Prioridade de Autenticação

```javascript
1º LDAP (Zimbra)      // Sempre tenta primeiro
2º Senha Local (PostgreSQL)  // Fallback se LDAP falhar
```

**Por quê nessa ordem?**
- Usuários do Zimbra são maioria
- LDAP é rápido (timeout 3 segundos)
- Se LDAP falhar (offline), usa senha local
- Alta disponibilidade

## ⚠️ Importante

### Senha no cadastro

Ao criar usuário, **sempre preencha a senha**, porque:

1. Se o usuário existir no LDAP → Senha ignorada, usa a do Zimbra
2. Se o usuário NÃO existir no LDAP → Usa a senha cadastrada

### Alteração de senha

- **Usuário LDAP**: Mude no Zimbra (automático no DataCare)
- **Usuário Local**: Edite no DataCare (`/pessoas/editar/:id`)

### Segurança

- ✅ Senhas locais criptografadas com bcrypt (10 rounds)
- ✅ Timeout LDAP de 3 segundos (não trava o login)
- ✅ Logs de tentativas de login
- ✅ Sessão JWT com expiração de 8 horas

## 🧪 Testar Autenticação

### Verificar se usuário existe no LDAP

```bash
ldapsearch -x -H ldap://seu-servidor \
  -b "ou=people,dc=arh,dc=com,dc=br" \
  "(uid=marlonmedico)"
```

### Verificar usuário no PostgreSQL

```sql
SELECT 
    cd_usuario,
    nm_usuario,
    ds_usuario,
    CASE 
        WHEN ds_senha IS NOT NULL THEN 'Tem senha local'
        ELSE 'Sem senha local (usa LDAP)'
    END as tipo_autenticacao
FROM usuarios
WHERE nm_usuario = 'marlonmedico';
```

### Testar login via logs

```bash
# Terminal onde o servidor roda
# Verá logs assim:

✅ Autenticado via LDAP: marlonfilho
# ou
✅ Autenticado via senha local: marlonmedico
# ou
❌ Senha local inválida: marlonmedico
```

## 🚀 Resumo

| Usuário | Onde existe | Método de Auth | Senha |
|---------|-------------|----------------|-------|
| marlonfilho | LDAP + PostgreSQL | LDAP (Zimbra) | Zimbra |
| marlonmedico | Só PostgreSQL | Senha Local | DataCare |
| medico.externo | Só PostgreSQL | Senha Local | DataCare |
| admin | LDAP + PostgreSQL | LDAP (Zimbra) | Zimbra |

**Agora você pode:**
- ✅ Logar usuários do Zimbra (ex: marlonfilho)
- ✅ Logar usuários locais (ex: marlonmedico)
- ✅ Sistema funciona mesmo se Zimbra estiver offline (fallback)
