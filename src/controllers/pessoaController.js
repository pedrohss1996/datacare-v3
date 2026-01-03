const { dbApp: db } = require('../infra/database/connection');

module.exports = {
    renderizarCadastro: (req, res) => {
        res.render('pages/pessoas/cadastro', {
            title: 'Cadastro Completo',
            layout: 'layouts/main',
            user: req.user || { name: 'Admin', role: 'TI' }
        });
    },

    cadastrar: async (req, res) => {
        const transacao = await db.transaction();

        try {
            // 1. Recebe TODOS os campos do novo formulário gigante
            const { 
                nome, dt_nascimento, sexo, estado_civil,
                cd_nacionalidade, altura, peso, cd_religiao, cd_profissao, // Numéricos
                cpf, rg, orgao_rg, prontuario, // Documentos
                telefone, email, // Contato
                cep, endereco, numero, complemento, bairro, municipio, uf, ibge, // Endereço
                
                criar_usuario, modal_usuario, modal_senha, modal_perfil // Usuário
            } = req.body;

            // 2. INSERE NA TABELA 'pessoa_fisica'
            // Mapeamento completo: (Coluna Banco : Valor Form)
            const [pessoaCriada] = await transacao('pessoa_fisica').insert({
                nm_pessoa_fisica: nome.toUpperCase(),
                nr_cpf: cpf ? cpf.replace(/\D/g, '') : null,
                nr_identidade: rg ? rg.toUpperCase() : null,
                ds_orgao_emissor_ci: orgao_rg ? orgao_rg.toUpperCase() : null,
                // Tratamento para números: se vier vazio, manda null
                nr_prontuario: prontuario || null, 
                dt_nascimento: dt_nascimento || null,
                ie_sexo: sexo || null,
                ie_estado_civil: estado_civil || null,
                cd_nacionalidade: cd_nacionalidade || null,
                cd_religiao: cd_religiao || null,
                cd_profissao: cd_profissao || null,
                qt_altura_cm: altura || null,
                qt_peso: peso || null,
                nr_telefone_celular: telefone || null,
                ds_email: email || null,
                cd_cep: cep ? cep.replace(/\D/g, '') : null,
                ds_endereco: endereco ? endereco.toUpperCase() : null,
                nr_endereco: numero ? numero.toUpperCase() : null,
                ds_complemento: complemento ? complemento.toUpperCase() : null,
                ds_bairro: bairro ? bairro.toUpperCase() : null,
                ds_municipio: municipio ? municipio.toUpperCase() : null,
                sg_estado: uf || null,
                cd_municipio_ibge: ibge || null,
                
                dt_cadastro: new Date()
            }).returning('cd_pessoa_fisica'); // Pega o ID

            const idPessoa = pessoaCriada.cd_pessoa_fisica;

            // 3. INSERE USUÁRIO (Se marcado) - Mantém a lógica anterior
            if (criar_usuario === 'on') {
                if (!modal_usuario || !modal_senha) throw new Error('Usuário e senha obrigatórios.');

                await transacao('usuarios').insert({
                    nm_usuario: modal_usuario,
                    ds_usuario: nome.toUpperCase(),
                    ds_senha: modal_senha,
                    cd_pessoa: idPessoa, // Vínculo
                    cd_perfil_inicial: parseInt(modal_perfil) || null,
                    ie_situacao: 'A',
                    dt_criacao: new Date()
                    // Outros campos default do usuário
                });
            }

            await transacao.commit();
            res.redirect('/pessoas?sucesso=true');

        } catch (erro) {
            await transacao.rollback();
            console.error(erro);
            
            let msg = 'Erro ao salvar.';
            if (erro.code === '23505') {
                 if(erro.detail.includes('nr_cpf')) msg = 'CPF já existe.';
                 if(erro.detail.includes('nr_prontuario')) msg = 'Prontuário já existe.';
                 if(erro.detail.includes('nm_usuario')) msg = 'Login já existe.';
            } else if (erro.code === '22P02') {
                msg = 'Erro de tipo de dado inválido (verifique campos numéricos).';
            }
            res.send(`<h1>Erro!</h1><p>${msg}</p><p class="text-sm">${erro.message}</p>`);
        }
    }
};