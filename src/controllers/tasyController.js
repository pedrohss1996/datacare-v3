const db = require('../infra/database/connection');



// Função auxiliar para padronizar o retorno do Oracle/Knex
// O Knex raw pode retornar um array direto ou um objeto com .rows
function getRows(result) {
    if (!result) return [];
    return Array.isArray(result) ? result : (result.rows || []);
}

module.exports = {

    // 1. DROPDOWN 1: TIPO DE AGENDA / UNIDADE
    listarUnidades: async (req, res) => {
        try {
            const sql = `
                SELECT DISTINCT 1 AS CD_TIPO, 'Agenda de Consultas' AS DS_TIPO FROM DUAL 
                UNION ALL
                SELECT DISTINCT 2 AS CD_TIPO, 'Agenda de Exames' AS DS_TIPO FROM DUAL 
                ORDER BY DS_TIPO
            `;
            const dados = await db.oracle.raw(sql);
            res.json(dados);
        } catch (e) {
            console.error("Erro Unidades:", e.message);
            res.status(500).json({ error: e.message });
        }
    },

    // 2. DROPDOWN 2: ESPECIALIDADES
    listarEspecialidades: async (req, res) => {
        const { tipoId } = req.params;
        try {
            let sql = "";
            
            // 1 = Consulta
            if (parseInt(tipoId) === 1) {
                sql = `
                    SELECT DISTINCT 
                        e.cd_especialidade,
                        obter_ds_especialidade(e.cd_especialidade) as ds_especialidade
                    FROM agenda a
                    JOIN agenda_cons_especialidade e ON a.cd_agenda = e.cd_agenda
                    WHERE a.cd_tipo_agenda = 3 
                      AND a.ie_situacao = 'A'
                    ORDER BY ds_especialidade
                `;
            } 
            // 2 = Exame
            else {
                sql = `
                    SELECT DISTINCT 
                        b.CD_SETOR_EXCLUSIVO as cd_especialidade,
                        obter_ds_setor_atendimento(b.CD_SETOR_EXCLUSIVO) as ds_especialidade
                    FROM agenda b
                    WHERE b.cd_tipo_agenda = 2 
                      AND b.ie_situacao = 'A'
                      AND b.CD_SETOR_EXCLUSIVO IS NOT NULL
                    ORDER BY ds_especialidade
                `;
            }

            const dados = await db.oracle.raw(sql);
            res.json(dados);
        } catch (e) {
            console.error("Erro Especialidades:", e.message);
            res.status(500).json({ error: e.message });
        }
    },

    // 3. DROPDOWN 3: CONVÊNIOS
    listarConvenios: async (req, res) => {
        try {
            const sql = `
                SELECT DISTINCT 
                    CD_CONVENIO AS CD_CONVENIO, 
                    DS_CONVENIO AS DS_CONVENIO 
                FROM CONVENIO
                WHERE IE_SITUACAO = 'A'
                ORDER BY DS_CONVENIO
            `;
            const dados = await db.oracle.raw(sql);
            res.json(dados);
        } catch (e) {
            console.error("Erro Convenios:", e.message);
            res.status(500).json({ error: e.message });
        }
    },

    // 4. DROPDOWN 4: RECURSOS (MÉDICOS) - *** ATUALIZADO ***
    listarRecursos: async (req, res) => {
        try {
            const { tipo, especialidade, convenio } = req.query; 

            let sql = `
                    SELECT DISTINCT
                        CD_AGENDA AS CD_AGENDA,
                        DS_AGENDA AS DS_AGENDA
                    FROM DC_CHAT_AGENDAS
                    WHERE 1=1 
            `;

            const bindings = {};

            // Filtro simples de Tipo
            if (tipo) {
                sql += ` AND CD_TIPO = :tipo `;
                bindings.tipo = tipo;
            }

            // Lógica Especialidade: (Existe na regra com essa Esp) OR (Não tem regra nenhuma de Esp)
            if (especialidade) {
                sql += ` 
                    AND (
                        EXISTS (
                            SELECT 1 
                            FROM (
                                SELECT CD_AGENDA, CD_ESPECIALIDADE FROM agenda_cons_especialidade
                                UNION ALL
                                SELECT CD_AGENDA, CD_ESPECIALIDADE FROM agenda WHERE CD_ESPECIALIDADE IS NOT NULL AND CD_TIPO_AGENDA = 3
                            ) R
                            WHERE R.CD_AGENDA = DC_CHAT_AGENDAS.CD_AGENDA
                            AND R.CD_ESPECIALIDADE = :especialidade
                        )
                        OR
                        NOT EXISTS (
                            SELECT 1 
                            FROM (
                                SELECT CD_AGENDA, CD_ESPECIALIDADE FROM agenda_cons_especialidade
                                UNION ALL
                                SELECT CD_AGENDA, CD_ESPECIALIDADE FROM agenda WHERE CD_ESPECIALIDADE IS NOT NULL AND CD_TIPO_AGENDA = 3
                            ) R
                            WHERE R.CD_AGENDA = DC_CHAT_AGENDAS.CD_AGENDA
                        )
                    )
                `;
                bindings.especialidade = especialidade;
            }

            // Lógica Convênio: (Existe na regra com esse Conv) OR (Não tem regra nenhuma de Conv)
            if (convenio) {
                sql += ` 
                    AND (
                        EXISTS (
                            SELECT 1 
                            FROM REGRA_LIB_CONV_AGENDA R 
                            WHERE R.CD_AGENDA = DC_CHAT_AGENDAS.CD_AGENDA 
                            AND R.CD_CONVENIO = :convenio
                        )
                        OR
                        NOT EXISTS (
                            SELECT 1 
                            FROM REGRA_LIB_CONV_AGENDA R 
                            WHERE R.CD_AGENDA = DC_CHAT_AGENDAS.CD_AGENDA
                        )
                    )
                `;
                bindings.convenio = convenio;
            }

            // Ordenação sempre no final
            sql += ` ORDER BY DS_AGENDA`;

            const dados = await db.oracle.raw(sql, bindings);
            res.json(dados);

        } catch (e) { 
            console.error("Erro Recursos:", e.message);
            res.status(500).json({ error: e.message }); 
        }
    },

    // 5. GRID DE HORÁRIOS
    listarAgenda: async (req, res) => {
        try {
            const { recurso, data } = req.body;

            if (!recurso || !data) {
                return res.status(400).json({ error: 'Parâmetros obrigatórios.' });
            }

            const recursoId = parseInt(recurso, 10);
            if (isNaN(recursoId)) {
                return res.status(400).json({ error: 'ID do recurso inválido.' });
            }

            const dataLimpa = data.substring(0, 10);

            const sql = `
                SELECT 
                    NR_SEQUENCIA       AS ID,
                    HR_AGENDA          AS HORA,
                    IE_STATUS_AGENDA   AS IE_STATUS,
                    DS_STATUS_AGENDA   AS STATUS_DESC,
                    NM_PACIENTE        AS PACIENTE,
                    CD_CONVENIO        AS CODIGO_CONVENIO,
                    DS_CONVENIO        AS CONVENIO
                FROM DC_CHAT_AGENDAS          
                WHERE CD_AGENDA = :recursoId
                AND TRUNC(DT_AGENDA) = TO_DATE(:dataLimpa, 'YYYY-MM-DD')
                ORDER BY HR_AGENDA ASC
            `;
            
            const dados = await db.oracle.raw(sql, { recursoId, dataLimpa });
            res.json(dados);

        } catch (e) { 
            console.error("Erro Agenda:", e.message);
            res.status(500).json({ error: e.message }); 
        }
    },

    // 6. AÇÕES GERAIS (Confirmar, Cancelar, Bloquear, Transferir)
    confirmar: async (req, res) => {
        const { agendaId, obs } = req.body;
        if (!agendaId) return res.status(400).json({ error: 'ID obrigatório' });

        try {
            const params = {
                cd_tipo: 1, 
                observacao: obs || 'Confirmado via Web',
                IdSequencia: agendaId
            };
            const sql = `
                BEGIN
                    IF :cd_tipo = 1 THEN
                        UPDATE agenda_consulta SET ie_status_agenda = 'CN', dt_confirmacao = SYSDATE, nm_usuario_confirm = 'DATA', ds_confirmacao = :observacao WHERE nr_sequencia = :IdSequencia;
                    ELSIF :cd_tipo = 2 THEN
                        UPDATE agenda_paciente SET ie_status_agenda = 'CN', dt_confirmacao = SYSDATE, nm_usuario_confirm = 'DATA', ds_confirmacao = :observacao WHERE nr_sequencia = :IdSequencia;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true });
        } catch (e) {
            console.error("Erro Confirmar:", e.message);
            res.status(500).json({ error: 'Erro ao confirmar.' });
        }
    },

    cancelar: async (req, res) => {
        const { agendaId } = req.body;
        if (!agendaId) return res.status(400).json({ error: 'ID obrigatório' });
        try {
            const params = { cd_tipo: 1, IdSequencia: agendaId };
            const sql = `
                BEGIN
                    IF :cd_tipo = 1 THEN
                        UPDATE agenda_consulta SET cd_motivo_cancelamento = 302, IE_STATUS_AGENDA = 'C', dt_cancelamento = SYSDATE, nm_usuario_cancelamento = 'DATA' WHERE nr_sequencia = :IdSequencia;
                    ELSIF :cd_tipo = 2 THEN
                        UPDATE agenda_paciente SET cd_motivo_cancelamento = 302, IE_STATUS_AGENDA = 'C', dt_cancelamento = SYSDATE, nm_usuario_cancel = 'DATA' WHERE nr_sequencia = :IdSequencia;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true });
        } catch (e) {
            console.error("Erro Cancelar:", e.message);
            res.status(500).json({ error: 'Erro ao cancelar.' });
        }
    },

    bloquear: async (req, res) => {
        const { agendaId } = req.body;
        if (!agendaId) return res.status(400).json({ error: 'ID obrigatório' });
        try {
            const params = { cd_tipo: 1, IdSequencia: agendaId };
            const sql = `
                BEGIN
                    IF :cd_tipo = 1 THEN
                        UPDATE agenda_consulta SET ie_status_agenda = 'B', nr_seq_motivo_bloq = 5, dt_atualizacao = SYSDATE WHERE nr_sequencia = :IdSequencia;
                    ELSIF :cd_tipo = 2 THEN
                        UPDATE agenda_paciente SET ie_status_agenda = 'B', nr_seq_motivo_bloq = 5, dt_bloqueio = SYSDATE, nm_usuario_bloq = 'DATA', dt_atualizacao = SYSDATE WHERE nr_sequencia = :IdSequencia;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true });
        } catch (e) {
            console.error("Erro Bloquear:", e.message);
            res.status(500).json({ error: 'Erro ao bloquear.' });
        }
    },

    agendarNovo: async (req, res) => {
        const { agendaId, pacienteNome, obs, cd_tipo } = req.body;
        if (!agendaId || !pacienteNome) return res.status(400).json({ error: 'Dados incompletos.' });

        const tipoAgenda = cd_tipo || 1; 

        try {
            const params = {
                pacienteNome: pacienteNome.toUpperCase(),
                obs: obs || 'Agendado via Chat',
                agendaId: agendaId,
                tipo: tipoAgenda
            };
            const sql = `
                BEGIN
                    IF :tipo = 1 THEN
                        UPDATE agenda_consulta SET nm_paciente = :pacienteNome, ie_status_agenda = 'A', ds_observacao = :obs, dt_atualizacao = SYSDATE, nm_usuario_origem = 'DATACARE' WHERE nr_sequencia = :agendaId;
                    ELSIF :tipo = 2 THEN
                        UPDATE agenda_paciente SET nm_paciente = :pacienteNome, ie_status_agenda = 'A', ds_observacao = :obs, dt_atualizacao = SYSDATE, nm_usuario_orig = 'DATACARE' WHERE nr_sequencia = :agendaId;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true });
        } catch (e) {
            console.error("Erro Agendar:", e.message);
            res.status(500).json({ error: 'Erro ao agendar.' });
        }
    },

    transferir: async (req, res) => {
        const { agendaIdAntiga, agendaIdNova, obs, cd_tipo } = req.body;
        if (!agendaIdAntiga || !agendaIdNova) return res.status(400).json({ error: 'IDs obrigatórios.' });

        try {
            const params = {
                idAntigo: agendaIdAntiga,
                idNovo: agendaIdNova,
                tipo: cd_tipo || 1, 
                obs: obs || 'Transferido via Chat',
                usuario: 'DATACARE'
            };

            const sql = `
                DECLARE
                    v_paciente VARCHAR2(200);
                BEGIN
                    IF :tipo = 1 THEN
                        SELECT nm_paciente INTO v_paciente FROM agenda_consulta WHERE nr_sequencia = :idAntigo;
                        UPDATE agenda_consulta SET ie_status_agenda = 'C', cd_motivo_cancelamento = 302, dt_cancelamento = SYSDATE, nm_usuario_cancelamento = :usuario WHERE nr_sequencia = :idAntigo;
                        UPDATE agenda_consulta SET nm_paciente = v_paciente, ie_status_agenda = 'A', ds_observacao = :obs, dt_atualizacao = SYSDATE, nm_usuario_agendou = :usuario WHERE nr_sequencia = :idNovo;
                    ELSIF :tipo = 2 THEN
                        SELECT nm_paciente INTO v_paciente FROM agenda_paciente WHERE nr_sequencia = :idAntigo;
                        UPDATE agenda_paciente SET ie_status_agenda = 'C', cd_motivo_cancelamento = 302, dt_cancelamento = SYSDATE, nm_usuario_cancel = :usuario WHERE nr_sequencia = :idAntigo;
                        UPDATE agenda_paciente SET nm_paciente = v_paciente, ie_status_agenda = 'A', ds_observacao = :obs, dt_atualizacao = SYSDATE, nm_usuario_agend = :usuario WHERE nr_sequencia = :idNovo;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true, message: "Transferência realizada." });
        } catch (e) {
            console.error("Erro Transferencia:", e.message);
            res.status(500).json({ error: e.message });
        }
    },
    // 8. ORIENTAÇÕES DAS AGENDAS
    obterOrientacao: async (req, res) => {
        try {
            const { agendaId, tipo } = req.query;
            
            if (!agendaId || !tipo) {
                return res.json({ orientacao: '' });
            }

            let sql = "";
            if (parseInt(tipo) === 1) {
                sql = `SELECT CONVERT_TEXT_TO_HTML(DS_ORIENTACAO) AS DS_ORIENTACAO FROM AGENDA WHERE CD_AGENDA = :agendaId`;
            } else {
                sql = `SELECT obter_html_orientacao(ROWID) AS DS_ORIENTACAO FROM AGENDA_ORIENTACAO WHERE CD_AGENDA = :agendaId`;
            }

            const dados = await db.oracle.raw(sql, { agendaId });
            const texto = (dados && dados.length > 0) ? dados[0].DS_ORIENTACAO : '';
            res.json({ orientacao: texto });

        } catch (e) {
            console.error("Erro Orientacao:", e.message);
            res.json({ orientacao: '' }); 
        }
    },

    // 8. LISTA DE CONTATOS ATIVOS (Pacientes para Confirmar Amanhã - Agenda 334)
    listarContatosAtivos: async (req, res) => {
        try {
            const sql = `
              SELECT 
                    'Consulta'                                   as "ds_tipo",
                    a.cd_agenda                                  as "id",
                    a.nm_paciente                                as "nome",
                    obter_nome_medico(b.cd_pessoa_fisica, 'ps')  as "motivo", -- Nome do médico entra como motivo/descrição
                    TO_CHAR(a.dt_agenda, 'HH24:MI')              as "horario",
                    SUBSTR(REGEXP_REPLACE(a.nr_telefone, '[^0-9]', ''), 1, 11) as "whatsapp",
                    a.dt_agenda                                  as "data_original"
                    FROM agenda_consulta a
                    JOIN agenda b ON a.cd_agenda = b.cd_agenda
                    WHERE a.IE_STATUS_AGENDA = 'N'
                    AND a.dt_agenda >= TRUNC(SYSDATE + 1)
                    AND a.dt_agenda <= TRUNC(SYSDATE + 1)
                                    + (SYSDATE - TRUNC(SYSDATE))
            `;

            const dados = await db.oracle.raw(sql);
            res.json(dados);

        } catch (e) {
            console.error("Erro Contatos Ativos (Agenda 334):", e.message);
            res.json([]); 
        }
    },

    // =========================================================================
    // 1. BUSCAR PACIENTES (AUTOCOMPLETE)
    // =========================================================================
    buscarPacientes: async (req, res) => {
        if (!db.oracle) return res.status(500).json({ error: 'Conexão Oracle não configurada.' });

        const { termo } = req.query;
        if (!termo) return res.json([]);

        const sql = `
            SELECT cd_pessoa_fisica, nr_cpf, nm_pessoa_fisica, NR_TELEFONE_CELULAR 
            FROM pessoa_fisica
            WHERE UPPER(nm_pessoa_fisica) LIKE UPPER('%' || :valor || '%')
               OR REGEXP_REPLACE(nr_cpf, '[^0-9]', '') LIKE '%' || :valor || '%'
               OR REGEXP_REPLACE(NR_TELEFONE_CELULAR, '[^0-9]', '') LIKE '%' || :valor || '%'
        `;

        try {
            const result = await db.oracle.raw(sql, { valor: termo });
            res.json(getRows(result));
        } catch (error) {
            console.error('Erro ao buscar pacientes:', error);
            res.status(500).json({ error: 'Erro interno ao buscar pacientes' });
        }
    },

    // =========================================================================
    // 2. DETALHES DO PACIENTE (PARA POPULAR MODAL)
    // =========================================================================
    getDetalhesPaciente: async (req, res) => {
        if (!db.oracle) return res.status(500).json({ error: 'Conexão Oracle não configurada.' });
        
        const { id } = req.params;
        const sql = `
            SELECT distinct A.*, B.CD_CEP, B.DS_ENDERECO, B.NR_ENDERECO, B.DS_COMPLEMENTO, 
                   B.DS_BAIRRO, B.DS_MUNICIPIO, B.SG_ESTADO, B.NR_SEQ_PAIS, B.DS_EMAIL
            FROM PESSOA_FISICA A
            LEFT JOIN COMPL_PESSOA_FISICA B ON A.CD_PESSOA_FISICA = B.CD_PESSOA_FISICA AND B.IE_TIPO_COMPLEMENTO = 1
            WHERE A.CD_PESSOA_FISICA = :id
        `;

        try {
            const result = await db.oracle.raw(sql, { id });
            const rows = getRows(result);
            res.json(rows.length > 0 ? rows[0] : {});
        } catch (error) {
            console.error('Erro ao buscar detalhes:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // =========================================================================
    // 3. SALVAR OU ATUALIZAR PACIENTE (PL/SQL)
    // =========================================================================
    salvarPaciente: async (req, res) => {
        if (!db.oracle) return res.status(500).json({ error: 'Conexão Oracle não configurada.' });

        const d = req.body;
        
        // Tratamento de Telefone
        let ddd = '', tel = d.telefone || '';
        const telLimpo = tel.replace(/\D/g, '');
        if (telLimpo.length > 2) {
            ddd = telLimpo.substring(0, 2);
            tel = telLimpo.substring(2);
        }

        const params = {
            CD_PESSOA_FISICA: d.cd_pessoa_fisica || null,
            NM_PESSOA_FISICA: d.nome,
            NM_SOCIAL: d.nome_social || null,
            DT_NASCIMENTO: d.nascimento ? new Date(d.nascimento) : null,
            IE_SEXO: d.sexo,
            NR_DDD_CELULAR: ddd,
            NR_TELEFONE_CELULAR: tel,
            NR_CPF: d.cpf ? d.cpf.replace(/\D/g, '') : null,
            QT_ALTURA_CM: d.altura || null,
            QT_PESO: d.peso || null,
            CD_NACIONALIDADE: d.nacionalidade || 10,
            CD_RELIGIAO: d.religiao || null,
            CD_CEP: d.cep || null,
            DS_ENDERECO: d.endereco || null,
            NR_ENDERECO: d.numero || null,
            DS_COMPLEMENTO: d.complemento || null,
            DS_BAIRRO: d.bairro || null,
            DS_MUNICIPIO: d.cidade || null,
            SG_ESTADO: d.uf || null,
            NR_SEQ_PAIS: 10,
            DS_EMAIL: d.email || null
        };

        const sql = `
        DECLARE
            v_cd_pessoa  NUMBER := :CD_PESSOA_FISICA; 
        BEGIN
            UPDATE PESSOA_FISICA SET
                NM_PESSOA_FISICA    = :NM_PESSOA_FISICA,
                NM_SOCIAL           = :NM_SOCIAL,
                DT_NASCIMENTO       = :DT_NASCIMENTO,
                IE_SEXO             = :IE_SEXO,
                NR_DDD_CELULAR      = :NR_DDD_CELULAR,
                NR_TELEFONE_CELULAR = :NR_TELEFONE_CELULAR,
                NR_CPF              = :NR_CPF,
                QT_ALTURA_CM        = :QT_ALTURA_CM,
                QT_PESO             = :QT_PESO,
                CD_NACIONALIDADE    = :CD_NACIONALIDADE,
                CD_RELIGIAO         = :CD_RELIGIAO,
                DT_ATUALIZACAO      = sysdate,
                NM_USUARIO          = 'DATACARE'
            WHERE CD_PESSOA_FISICA = v_cd_pessoa;

            IF SQL%ROWCOUNT = 0 THEN
                v_cd_pessoa := PESSOA_FISICA_SEQ.NEXTVAL;
                INSERT INTO PESSOA_FISICA (
                    CD_PESSOA_FISICA, NM_PESSOA_FISICA, NM_SOCIAL, DT_NASCIMENTO, 
                    IE_SEXO, NR_DDD_CELULAR, NR_TELEFONE_CELULAR, NR_CPF, 
                    QT_ALTURA_CM, QT_PESO, CD_NACIONALIDADE, CD_RELIGIAO,
                    DT_ATUALIZACAO, NM_USUARIO, NM_USUARIO_ORIGINAL, 
                    DT_ADMISSAO_HOSP, DT_CADASTRO_ORIGINAL, 
                    DT_ATUALIZACAO_NREC, NM_USUARIO_NREC
                ) VALUES (
                    v_cd_pessoa, :NM_PESSOA_FISICA, :NM_SOCIAL, :DT_NASCIMENTO, 
                    :IE_SEXO, :NR_DDD_CELULAR, :NR_TELEFONE_CELULAR, :NR_CPF, 
                    :QT_ALTURA_CM, :QT_PESO, :CD_NACIONALIDADE, :CD_RELIGIAO,
                    sysdate, 'DATACARE', 'DATACARE', 
                    sysdate, sysdate, 
                    sysdate, 'DATACARE'
                );
            END IF;

            MERGE INTO COMPL_PESSOA_FISICA destino
            USING (SELECT v_cd_pessoa AS cd, 1 AS tipo FROM dual) origem
            ON (destino.CD_PESSOA_FISICA = origem.cd AND destino.IE_TIPO_COMPLEMENTO = origem.tipo)
            WHEN MATCHED THEN
                UPDATE SET 
                    CD_CEP = :CD_CEP, DS_ENDERECO = :DS_ENDERECO, NR_ENDERECO = :NR_ENDERECO,
                    DS_COMPLEMENTO = :DS_COMPLEMENTO, DS_BAIRRO = :DS_BAIRRO, DS_MUNICIPIO = :DS_MUNICIPIO,
                    SG_ESTADO = :SG_ESTADO, NR_SEQ_PAIS = :NR_SEQ_PAIS, DS_EMAIL = :DS_EMAIL,
                    DT_ATUALIZACAO = sysdate, NM_USUARIO = 'DATACARE'
            WHEN NOT MATCHED THEN
                INSERT (
                    CD_PESSOA_FISICA, IE_TIPO_COMPLEMENTO, NR_SEQUENCIA, CD_CEP, DS_ENDERECO, NR_ENDERECO, 
                    DS_COMPLEMENTO, DS_BAIRRO, DS_MUNICIPIO, SG_ESTADO, NR_SEQ_PAIS, DS_EMAIL,
                    DT_ATUALIZACAO, NM_USUARIO, DT_ATUALIZACAO_NREC, NM_USUARIO_NREC
                ) VALUES (
                    v_cd_pessoa, 1, 1, :CD_CEP, :DS_ENDERECO, :NR_ENDERECO, 
                    :DS_COMPLEMENTO, :DS_BAIRRO, :DS_MUNICIPIO, :SG_ESTADO, :NR_SEQ_PAIS, :DS_EMAIL,
                    sysdate, 'DATACARE', sysdate, 'DATACARE'
                );
            COMMIT;
        END;`;

        try {
            await db.oracle.raw(sql, params);
            res.json({ success: true, message: 'Paciente salvo com sucesso!' });
        } catch (error) {
            console.error('Erro ao salvar paciente:', error);
            res.status(500).json({ error: 'Falha ao salvar paciente no Tasy.' });
        }
    },

    // =========================================================================
    // 4.1. DETALHES COMPLETOS DO AGENDAMENTO (PARA MODAL MAIS_DADOS)
    // =========================================================================
    getDetalhesAgendamento: async (req, res) => {
        if (!db.oracle) return res.status(500).json({ error: 'Conexão Oracle não configurada.' });

        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'ID do agendamento obrigatório.' });

        try {
            // Primeiro busca na view DC_CHAT_AGENDAS para pegar dados básicos
            const sqlBase = `
                SELECT 
                    NR_SEQUENCIA AS ID_AGENDA,
                    HR_AGENDA AS HORA,
                    IE_STATUS_AGENDA AS STATUS,
                    DS_STATUS_AGENDA AS STATUS_DESC,
                    NM_PACIENTE AS NOME_PACIENTE,
                    CD_CONVENIO AS COD_CONVENIO,
                    DS_CONVENIO AS CONVENIO,
                    DT_AGENDA AS DATA_AGENDA,
                    CD_AGENDA AS CD_AGENDA
                FROM DC_CHAT_AGENDAS
                WHERE NR_SEQUENCIA = :id
            `;

            const baseResult = await db.oracle.raw(sqlBase, { id });
            const baseRows = getRows(baseResult);
            
            if (baseRows.length === 0) {
                return res.status(404).json({ error: 'Agendamento não encontrado.' });
            }

            const dadosBase = baseRows[0];
            
            // Agora busca dados detalhados tentando primeiro agenda_consulta, depois agenda_paciente
            let sqlDetalhes = `
                SELECT 
                    ac.CD_PESSOA_FISICA,
                    ac.DT_AGENDAMENTO,
                    ac.DT_ATUALIZACAO,
                    ac.NM_USUARIO,
                    ac.DS_OBSERVACAO,
                    ag.DS_AGENDA AS NOME_MEDICO,
                    pf.NM_PESSOA_FISICA AS NOME_COMPLETO,
                    pf.NR_CPF AS CPF,
                    pf.DT_NASCIMENTO,
                    pf.NR_DDD_CELULAR || pf.NR_TELEFONE_CELULAR AS CELULAR,
                    (SELECT nm_pessoa_fisica FROM pessoa_fisica WHERE cd_pessoa_fisica = pf.cd_pessoa_mae) AS NOME_MAE
                FROM agenda_consulta ac
                LEFT JOIN agenda ag ON ac.CD_AGENDA = ag.CD_AGENDA
                LEFT JOIN pessoa_fisica pf ON ac.CD_PESSOA_FISICA = pf.CD_PESSOA_FISICA
                WHERE ac.NR_SEQUENCIA = :id
            `;

            let detalhesResult = await db.oracle.raw(sqlDetalhes, { id });
            let detalhesRows = getRows(detalhesResult);
            
            // Se não encontrou em agenda_consulta, tenta agenda_paciente
            if (detalhesRows.length === 0) {
                sqlDetalhes = `
                    SELECT 
                        ap.CD_PESSOA_FISICA,
                        ap.DT_AGENDAMENTO,
                        ap.DT_ATUALIZACAO,
                        ap.NM_USUARIO,
                        ap.DS_OBSERVACAO,
                        ag.DS_AGENDA AS NOME_MEDICO,
                        pf.NM_PESSOA_FISICA AS NOME_COMPLETO,
                        pf.NR_CPF AS CPF,
                        pf.DT_NASCIMENTO,
                        pf.NR_DDD_CELULAR || pf.NR_TELEFONE_CELULAR AS CELULAR,
                        (SELECT nm_pessoa_fisica FROM pessoa_fisica WHERE cd_pessoa_fisica = pf.cd_pessoa_mae) AS NOME_MAE
                    FROM agenda_paciente ap
                    LEFT JOIN agenda ag ON ap.CD_AGENDA = ag.CD_AGENDA
                    LEFT JOIN pessoa_fisica pf ON ap.CD_PESSOA_FISICA = pf.CD_PESSOA_FISICA
                    WHERE ap.NR_SEQUENCIA = :id
                `;
                detalhesResult = await db.oracle.raw(sqlDetalhes, { id });
                detalhesRows = getRows(detalhesResult);
            }

            const dados = detalhesRows.length > 0 ? detalhesRows[0] : {};
            
            // Formata os dados para o frontend
            const response = {
                id: dadosBase.ID_AGENDA,
                hora: dadosBase.HORA,
                status: dadosBase.STATUS,
                statusDesc: dadosBase.STATUS_DESC,
                paciente: {
                    nome: dados.NOME_COMPLETO || dadosBase.NOME_PACIENTE || 'Não informado',
                    cpf: dados.CPF || 'Não informado',
                    dataNascimento: dados.DT_NASCIMENTO ? new Date(dados.DT_NASCIMENTO).toLocaleDateString('pt-BR') : 'Não informado',
                    mae: dados.NOME_MAE || 'Não informado',
                    celular: dados.CELULAR || 'Não informado',
                    id: dados.CD_PESSOA_FISICA
                },
                clinico: {
                    convenio: dadosBase.CONVENIO || 'Não informado',
                    procedimento: dados.NOME_MEDICO || 'Consulta',
                    medico: dados.NOME_MEDICO || 'Não informado',
                    observacao: dados.DS_OBSERVACAO || ''
                },
                auditoria: {
                    criadoEm: dados.DT_AGENDAMENTO ? new Date(dados.DT_AGENDAMENTO).toLocaleString('pt-BR') : 'Não informado',
                    atualizadoEm: dados.DT_ATUALIZACAO ? new Date(dados.DT_ATUALIZACAO).toLocaleString('pt-BR') : 'Não informado',
                    usuario: dados.NM_USUARIO || 'Sistema'
                }
            };

            res.json(response);
        } catch (error) {
            console.error('Erro ao buscar detalhes do agendamento:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // =========================================================================
    // 4. CONFIRMAR AGENDAMENTO (CONSULTA OU EXAME)
    // =========================================================================
    confirmarAgendamento: async (req, res) => {
        if (!db.oracle) return res.status(500).json({ error: 'Conexão Oracle não configurada.' });

        const d = req.body;

        const params = {
            CD_TIPO: parseInt(d.cd_tipo),
            nr_sequencia: d.agendaId,
            CD_PESSOA_FISICA: d.pacienteId,
            NM_PESSOA_FISICA: d.pacienteNome,
            IE_STATUS_AGENDA: 'A',
            CD_CONVENIO: d.convenio,
            DS_OBSERVACAO: d.obs,
            NR_TELEFONE_CELULAR: d.telefone ? d.telefone.replace(/\D/g, '') : null,
            DT_NASCIMENTO: d.nascimento ? new Date(d.nascimento) : null,
            NR_SEQ_INDICACAO: null,
            CD_MEDICO: d.medico || null,
            CD_PROCEDIMENTO: d.procedimento || null,
            IE_ORIGEM_PROCED: 'A', IE_ANESTESIA: 'N', IE_EQUIPAMENTO: null, VL_PREVISTO: 0,
            CD_PROCEDIMENTO_TUSS: null, CD_MEDICO_EXEC: null, NR_SEQ_PROC_INTERNO: null,
            CD_SETOR_ATENDIMENTO: null, IE_FORMA_AGENDAMENTO: 'T', NR_SEQ_HORARIO: null,
            QT_PESO: d.peso || null, QT_ALTURA_CM: d.altura || null, DS_EMAIL: d.email || null
        };

        const sql = `
        BEGIN
            IF :CD_TIPO = 1 THEN
                UPDATE agenda_consulta SET
                    IE_STATUS_AGENDA = :IE_STATUS_AGENDA, CD_CONVENIO = :CD_CONVENIO,
                    CD_PESSOA_FISICA = :CD_PESSOA_FISICA, DS_OBSERVACAO = :DS_OBSERVACAO,
                    NR_SEQ_INDICACAO = :NR_SEQ_INDICACAO, DT_ATUALIZACAO = SYSDATE,
                    DT_AGENDAMENTO = SYSDATE, NM_PACIENTE = :NM_PESSOA_FISICA,
                    NR_TELEFONE = OBTER_TELEFONE_PF(:CD_PESSOA_FISICA,12), DT_NASCIMENTO_PAC = OBTER_DATA_NASCTO_PF(:CD_PESSOA_FISICA),
                    QT_IDADE_PAC = OBTER_IDADE_PF(:CD_PESSOA_FISICA, sysdate, 'A'), 
                    NM_USUARIO = 'DATACARE', NM_USUARIO_ORIGEM = 'DATACARE',
                    NM_USUARIO_CONFIRM = 'DATACARE', NM_PACIENTE_AGENDA = :NM_PESSOA_FISICA
                WHERE nr_sequencia = :nr_sequencia;
            ELSIF :CD_TIPO = 2 THEN
                UPDATE agenda_paciente SET
                    CD_PESSOA_FISICA = :CD_PESSOA_FISICA, CD_MEDICO = :CD_MEDICO,
                    CD_PROCEDIMENTO = :CD_PROCEDIMENTO, CD_CONVENIO = :CD_CONVENIO,
                    IE_ORIGEM_PROCED = :IE_ORIGEM_PROCED, IE_STATUS_AGENDA = :IE_STATUS_AGENDA,
                    IE_ANESTESIA = :IE_ANESTESIA, IE_EQUIPAMENTO = :IE_EQUIPAMENTO,
                    VL_PREVISTO = :VL_PREVISTO, CD_PROCEDIMENTO_TUSS = :CD_PROCEDIMENTO_TUSS,
                    CD_MEDICO_EXEC = :CD_MEDICO_EXEC, NR_SEQ_PROC_INTERNO = :NR_SEQ_PROC_INTERNO,
                    CD_SETOR_ATENDIMENTO = :CD_SETOR_ATENDIMENTO, IE_FORMA_AGENDAMENTO = :IE_FORMA_AGENDAMENTO,
                    NR_SEQ_HORARIO = :NR_SEQ_HORARIO, DT_ATUALIZACAO = SYSDATE,
                    DT_AGENDAMENTO = SYSDATE, HR_INICIO_ORIGEM = SYSDATE,
                    NM_PACIENTE = :NM_PESSOA_FISICA, NR_TELEFONE = OBTER_TELEFONE_PF(:CD_PESSOA_FISICA,12),
                    QT_PESO = :QT_PESO, QT_ALTURA_CM = :QT_ALTURA_CM,
                    DT_NASCIMENTO_PAC = OBTER_DATA_NASCTO_PF(:CD_PESSOA_FISICA), DS_EMAIL = :DS_EMAIL,
                    NM_PACIENTE_AGENDA = :NM_PESSOA_FISICA,
                    QT_IDADE_PACIENTE = OBTER_IDADE_PF(:CD_PESSOA_FISICA, sysdate, 'A'),
                    NM_USUARIO = 'DATACARE', NM_USUARIO_ORIG = 'DATACARE'
                WHERE nr_sequencia = :nr_sequencia;
            END IF;
            COMMIT;
        END;`;

        try {
            await db.oracle.raw(sql, params);
            res.json({ success: true, message: 'Agendamento confirmado!' });
        } catch (error) {
            console.error('Erro ao agendar:', error);
            res.status(500).json({ error: error.message });
        }
    }
};
