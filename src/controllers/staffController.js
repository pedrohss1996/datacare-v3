// src/controllers/staffController.js
const db = require('../infra/database/connection');

const staffController = {
    async index(req, res) {
        res.render('pages/staff/index', {
            title: 'DataCare - Staff',
            user: req.user
        });
    },

    async escalas(req, res) {
        res.render('pages/staff/escalas', {
            title: 'DataCare - Gestão de Escalas',
            user: req.user
        });
    },

    async listarFuncionarios(req, res) {
        try {
            const funcionarios = await db('staff_funcionarios')
                .leftJoin('staff_setores', 'staff_funcionarios.id_setor', 'staff_setores.id')
                .select(
                    'staff_funcionarios.id',
                    'staff_funcionarios.nm_funcionario',
                    'staff_funcionarios.ds_funcao',
                    'staff_funcionarios.ds_turno',
                    'staff_funcionarios.ds_escala',
                    'staff_funcionarios.dt_demissao',
                    'staff_funcionarios.id_setor',
                    db.raw("COALESCE(staff_setores.ds_setor, 'Sem setor') as ds_setor")
                )
                .orderBy('staff_setores.ds_setor')
                .orderBy('staff_funcionarios.nm_funcionario');
            res.json(funcionarios || []);
        } catch (err) {
            console.error('Erro ao listar funcionários:', err);
            res.status(500).json({ erro: err.message });
        }
    },

    async buscarFuncionario(req, res) {
        try {
            const { id } = req.params;
            const func = await db('staff_funcionarios')
                .leftJoin('staff_setores', 'staff_funcionarios.id_setor', 'staff_setores.id')
                .where('staff_funcionarios.id', id)
                .select(
                    'staff_funcionarios.*',
                    db.raw("COALESCE(staff_setores.ds_setor, '') as ds_setor")
                )
                .first();
            if (!func) return res.status(404).json({ erro: 'Funcionário não encontrado' });
            res.json(func);
        } catch (err) {
            console.error('Erro ao buscar funcionário:', err);
            res.status(500).json({ erro: err.message });
        }
    },

    async removerFuncionario(req, res) {
        try {
            const { id } = req.params;
            await db('staff_escala_dias').where('id_funcionario', id).del();
            await db('staff_remanejamentos').where('id_funcionario', id).del();
            await db('staff_funcionarios').where('id', id).del();
            res.json({ sucesso: true });
        } catch (err) {
            console.error('Erro ao remover funcionário:', err);
            res.status(500).json({ erro: err.message });
        }
    },

    async atualizarFuncionario(req, res) {
        try {
            const { id } = req.params;
            const { nm_funcionario, id_setor, ds_funcao, ds_turno, ds_escala } = req.body;
            await db('staff_funcionarios')
                .where('id', id)
                .update({
                    nm_funcionario: nm_funcionario || undefined,
                    id_setor: id_setor || null,
                    ds_funcao: ds_funcao || undefined,
                    ds_turno: ds_turno || undefined,
                    ds_escala: ds_escala || undefined
                });
            res.json({ sucesso: true });
        } catch (err) {
            console.error('Erro ao atualizar funcionário:', err);
            res.status(500).json({ erro: err.message });
        }
    },

    async listarColaboradores(req, res) {
        try {
            const colaboradores = await db('staff_funcionarios')
                .leftJoin('staff_setores', 'staff_funcionarios.id_setor', 'staff_setores.id')
                .select(
                    'staff_funcionarios.id as CD_FUNCIONARIO',
                    'staff_funcionarios.nm_funcionario as NM_FUNCIONARIO',
                    db.raw("COALESCE(staff_setores.ds_setor, 'Sem setor') as DS_SETOR_ATENDIMENTO"),
                    db.raw("COALESCE(staff_funcionarios.ds_funcao, 'N/A') as DS_FUNCAO"),
                    db.raw("COALESCE(staff_funcionarios.ds_turno, 'N/A') as DS_TURNO"),
                    db.raw("COALESCE(staff_funcionarios.ds_escala, 'N/A') as DS_ESCALA")
                )
                .whereNull('staff_funcionarios.dt_demissao')
                .orderByRaw("COALESCE(staff_setores.ds_setor, 'zzz') ASC")
                .orderBy('staff_funcionarios.nm_funcionario');

            res.json(colaboradores || []);
        } catch (err) {
            console.error('Erro ao listar colaboradores:', err);
            res.status(500).json({ erro: err.message });
        }
    },

    async buscarUsuarios(req, res) {
        try {
            const { q } = req.query;
            let query = db('usuarios as u')
                .leftJoin('pessoa_fisica as pf', 'u.cd_pessoa', 'pf.cd_pessoa_fisica')
                .select('u.cd_usuario', 'u.nm_usuario', 'u.ds_usuario', 'pf.nm_pessoa_fisica')
                .where('u.ie_situacao', 'A');
            if (q && String(q).trim()) {
                const term = `%${String(q).trim()}%`;
                query = query.where(function() {
                    this.whereRaw('UPPER(u.ds_usuario) LIKE ?', [term.toUpperCase()])
                        .orWhereRaw('UPPER(u.nm_usuario) LIKE ?', [term.toUpperCase()])
                        .orWhereRaw('UPPER(COALESCE(pf.nm_pessoa_fisica, \'\')) LIKE ?', [term.toUpperCase()]);
                });
            }
            const usuarios = await query.limit(15).orderBy('u.ds_usuario');
            res.json(usuarios || []);
        } catch (err) {
            console.error('Erro ao buscar usuários:', err);
            res.status(500).json({ erro: err.message });
        }
    },

    async listarSetores(req, res) {
        try {
            const setores = await db('staff_setores')
                .select('*')
                .orderBy('ds_setor');
            res.json(setores || []);
        } catch (err) {
            console.error('Erro ao listar setores:', err);
            res.status(500).json({ erro: err.message });
        }
    },

    async salvarFuncionario(req, res) {
        try {
            const { nm_funcionario, id_setor, ds_funcao, ds_turno, ds_escala, cd_usuario } = req.body;
            const [inserted] = await db('staff_funcionarios')
                .insert({
                    nm_funcionario,
                    id_setor: id_setor || null,
                    ds_funcao: ds_funcao || 'Colaborador',
                    ds_turno: ds_turno || 'Diurno',
                    ds_escala: ds_escala || '12x36',
                    cd_usuario: cd_usuario || null
                })
                .returning('*');
            res.json({ sucesso: true, dados: inserted });
        } catch (err) {
            console.error('Erro ao salvar funcionário:', err);
            res.status(500).json({ erro: err.message });
        }
    },

    async salvarSetor(req, res) {
        try {
            const { ds_setor, qt_min_profissionais, profissoes_minimas } = req.body;
            const qtTotal = Array.isArray(profissoes_minimas)
                ? profissoes_minimas.reduce((acc, p) => acc + (parseInt(p.qt_minima) || 0), 0)
                : (parseInt(qt_min_profissionais) || 1);
            const [inserted] = await db('staff_setores')
                .insert({ ds_setor, qt_min_profissionais: qtTotal })
                .returning('*');
            if (inserted && Array.isArray(profissoes_minimas) && profissoes_minimas.length > 0) {
                const rows = profissoes_minimas
                    .filter(p => p && (p.profissao || p.ds_profissao))
                    .map(p => ({
                        id_setor: inserted.id,
                        ds_profissao: (p.profissao || p.ds_profissao || '').trim(),
                        qt_minima: Math.max(0, parseInt(p.qt_minima) || 0)
                    }))
                    .filter(r => r.ds_profissao);
                if (rows.length > 0) {
                    await db('staff_setor_profissoes').insert(rows);
                }
            }
            res.json({ sucesso: true, dados: inserted });
        } catch (err) {
            console.error('Erro ao salvar setor:', err);
            res.status(500).json({ erro: err.message });
        }
    },

    async salvarEscala(req, res) {
        try {
            const { ano, mes, escalas, reallocations, demissoes } = req.body || {};
            const mesNum = parseInt(mes);

            if (demissoes && Array.isArray(demissoes)) {
                for (const d of demissoes) {
                    await db('staff_funcionarios')
                        .where('id', d.id_funcionario)
                        .update({ dt_demissao: d.dt_demissao });
                }
            }

            if (escalas && typeof escalas === 'object') {
                await db('staff_escala_dias').where({ ano: parseInt(ano), mes: mesNum }).del();
                const inserts = [];
                for (const [idFunc, dias] of Object.entries(escalas)) {
                    for (const [diaStr, statusOrObj] of Object.entries(dias)) {
                        const dia = parseInt(diaStr);
                        if (isNaN(dia) || dia < 1 || dia > 31) continue;
                        const status = typeof statusOrObj === 'object' && statusOrObj !== null ? statusOrObj.status : statusOrObj;
                        const extra = typeof statusOrObj === 'object' && statusOrObj !== null ? statusOrObj : null;
                        if (!status && status !== '') continue;
                        inserts.push({
                            id_funcionario: parseInt(idFunc),
                            ano: parseInt(ano),
                            mes: mesNum,
                            dia,
                            status: String(status || 'P'),
                            ds_ocorrencia: extra?.description || null,
                            extra: extra ? JSON.stringify(extra) : null
                        });
                    }
                }
                if (inserts.length > 0) await db('staff_escala_dias').insert(inserts);
            }

            if (reallocations && Array.isArray(reallocations)) {
                await db('staff_remanejamentos')
                    .where({ ano: parseInt(ano), mes: mesNum })
                    .del();
                for (const r of reallocations) {
                    await db('staff_remanejamentos').insert({
                        id_funcionario: r.id_funcionario,
                        ano: r.ano,
                        mes: r.mes,
                        dia: r.dia,
                        id_setor_destino: r.id_setor_destino || null
                    });
                }
            }

            res.json({ sucesso: true });
        } catch (err) {
            console.error('Erro ao salvar escala:', err);
            res.status(500).json({ erro: err.message });
        }
    },

    async buscarEscalas(req, res) {
        try {
            const { ano, mes } = req.query;
            const mesNum = parseInt(mes) || 1;
            const escalas = await db('staff_escala_dias')
                .where({ ano: parseInt(ano) || new Date().getFullYear(), mes: mesNum })
                .select('*');
            const porFuncionario = {};
            escalas.forEach(e => {
                if (!porFuncionario[e.id_funcionario]) porFuncionario[e.id_funcionario] = {};
                let valor = e.status;
                if (e.extra) {
                    try { valor = { ...JSON.parse(e.extra), status: e.status }; } catch (_) { valor = e.ds_ocorrencia ? { status: e.status, description: e.ds_ocorrencia } : e.status; }
                } else if (e.ds_ocorrencia) {
                    valor = { status: e.status, description: e.ds_ocorrencia };
                }
                porFuncionario[e.id_funcionario][e.dia] = valor;
            });
            const remanejamentos = await db('staff_remanejamentos as r')
                .leftJoin('staff_setores as s', 'r.id_setor_destino', 's.id')
                .where({ 'r.ano': parseInt(ano) || new Date().getFullYear(), 'r.mes': mesNum })
                .select('r.id_funcionario', 'r.dia', 'r.id_setor_destino', db.raw("COALESCE(s.ds_setor, '') as ds_setor"));
            const remObj = {};
            remanejamentos.forEach(r => {
                if (!remObj[r.id_funcionario]) remObj[r.id_funcionario] = {};
                remObj[r.id_funcionario][r.dia] = { newSector: r.ds_setor, newSectorId: r.id_setor_destino };
            });
            res.json({ escalas: porFuncionario, remanejamentos: remObj });
        } catch (err) {
            console.error('Erro ao buscar escalas:', err);
            res.status(500).json({ erro: err.message });
        }
    }
};

module.exports = staffController;
