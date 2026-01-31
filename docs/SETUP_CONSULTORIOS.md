# Setup do Módulo Consultórios

Este documento descreve os passos necessários para configurar o módulo de Consultórios da DataCare.

## 📋 Pré-requisitos

- Banco de dados configurado
- Node.js instalado
- Variáveis de ambiente (.env) configuradas

## 🔧 Configuração Inicial

### 1. Adicionar campo CPF na tabela usuarios

Execute a migration para adicionar o campo `nr_cpf` na tabela `usuarios`:

```bash
npx knex migrate:latest --knexfile src/infra/database/knexfile.js
```

### 2. Atualizar CPF do usuário marlonfilho

Execute o script para adicionar o CPF ao usuário:

```bash
node scripts/update-user-cpf.js
```

**Saída esperada:**
```
🔄 Atualizando CPF do usuário marlonfilho...
✅ Usuário encontrado: marlonfilho (Marlon Filho)
✅ CPF 87209829172 atualizado com sucesso para o usuário marlonfilho!

📋 Dados atualizados:
   Usuário: marlonfilho
   Nome: Marlon Filho
   CPF: 87209829172
   Situação: A
```

### 3. Adicionar CPF para outros médicos

Para adicionar CPF para outros usuários/médicos, você pode:

**Opção A - Via SQL direto:**
```sql
UPDATE usuarios 
SET nr_cpf = '12345678900' 
WHERE nm_usuario = 'nome.usuario';
```

**Opção B - Modificar o script:**
Edite `scripts/update-user-cpf.js` e altere as variáveis:
```javascript
const usuario = 'outro.medico';
const cpf = '12345678900';
```

## 🔑 Como funciona o vínculo

1. **Login**: O usuário faz login com suas credenciais (LDAP)
2. **Sessão**: O sistema busca o `nr_cpf` da tabela `usuarios` e armazena na sessão
3. **Filtro**: Nas consultas do TASY, o CPF é usado para filtrar apenas as agendas daquele médico:
   ```sql
   SELECT cd_pessoa_fisica 
   FROM pessoa_fisica 
   WHERE nr_cpf = '87209829172'
   ```
4. **Agenda**: Apenas as consultas vinculadas ao `cd_pessoa_fisica` do médico são exibidas

## 📊 Estrutura de dados

### Tabela: usuarios
```
cd_usuario (PK)
nm_usuario (login)
ds_usuario (nome completo)
nr_cpf (CPF - novo campo) ← CHAVE DE VÍNCULO
```

### Tabela TASY: pessoa_fisica
```
cd_pessoa_fisica (PK)
nr_cpf ← CHAVE DE VÍNCULO
nm_pessoa_fisica
```

### Tabela TASY: agenda
```
cd_agenda (PK)
cd_pessoa_fisica (FK) ← Vínculo com pessoa_fisica
cd_tipo_agenda = 3 (consultas)
ie_situacao = 'A' (ativa)
```

### View: DC_CHAT_AGENDAS
```
Consultas agregadas com informações do paciente
Filtrada por cd_agenda
```

## 🧪 Testando

1. Faça login com o usuário `marlonfilho`
2. Acesse `/consultorios`
3. Clique em "Agenda"
4. Verifique se as consultas aparecem filtradas pelo CPF 87209829172

## ⚠️ Troubleshooting

### Erro: "CPF não cadastrado para este usuário"
- Execute o script de atualização: `node scripts/update-user-cpf.js`
- Verifique se a migration foi executada
- Confirme que o campo `nr_cpf` existe na tabela `usuarios`

### Nenhuma consulta aparece
- Verifique se o CPF existe na tabela `pessoa_fisica` do TASY
- Confirme que existem agendas ativas (`ie_situacao = 'A'`)
- Verifique se o tipo de agenda é 3 (consultas)
- Consulte os logs do servidor para ver a query executada

### Erro de conexão com banco
- Verifique as variáveis de ambiente (.env)
- Confirme que o Oracle está acessível
- Teste a conexão com outros módulos (Analytics, Chat)

## 📝 Notas

- O CPF deve conter apenas números (11 dígitos)
- O sistema remove automaticamente máscaras (pontos e hífens)
- Cada médico só visualiza suas próprias consultas
- A data padrão é o dia atual, mas pode ser navegada
