(function() {
'use strict';

const fieldMapping = { id: 'cd_funcionario', nome: 'nm_funcionario', setor: 'ds_setor_atendimento', funcao: 'ds_funcao', turno: 'ds_turno', escala: 'ds_escala' };
const ESCALAS = ['6x1', '5x2', '12x36', '24x48'];
function normalizarTurno(v) { return (v === 'Diurno' || v === 'Noturno') ? v : (ESCALAS.includes(v || '') ? 'Diurno' : (v || 'N/A')); }
function getApiField(item, key) {
    const k = fieldMapping[key];
    return item != null ? (item[k] ?? item[k?.toUpperCase?.()]) : undefined;
}
const PROFISSOES_SETOR = ['Médico', 'Enfermeiro', 'Técnico de Enfermagem', 'Fisioterapeuta', 'Fonoaudiólogo', 'Nutricionista', 'Psicólogo', 'Assistente Social', 'Farmácia', 'Técnico de Laboratório', 'Administrativo', 'Outros'];
const actionNames = { FE: 'Férias', FO: 'Folga', SU: 'Suspensão', DE: 'Demissão' };
const occurrenceNames = { FE: 'Férias', SU: 'Suspensões', FJ: 'Faltas Justificadas', FI: 'Faltas Injustificadas', AS: 'Atestados', AO: 'Atestados de Óbito' };
const holidays = { '01-01': 'Confraternização Universal', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho', '09-07': 'Independência', '10-12': 'Nossa Senhora Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República', '12-25': 'Natal' };

let currentDate = new Date();
let schedules = {};
let reallocations = {};
let allCollaborators = [];
let swapLog = {};
let columnWidthsSet = false;
let selectedCollaboratorId = null;
let selectedDay = null;
let selectedAction = null;
let confirmationCallback = null;
let isBulkScheduleMode = true;
let charts = {};

function getHoliday(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return holidays[`${m}-${d}`];
}

function initializeDashboard(data) {
    allCollaborators = (data || []).map(item => ({
        id: String(getApiField(item, 'id') ?? item?.id ?? ''),
        nome: getApiField(item, 'nome') || 'N/A',
        setor: getApiField(item, 'setor') || 'N/A',
        funcao: getApiField(item, 'funcao') || 'N/A',
        turno: normalizarTurno(getApiField(item, 'turno')),
        escala: getApiField(item, 'escala') || 'N/A',
        dismissalDate: null
    }));
    allCollaborators.sort((a, b) => (a.setor + a.nome).localeCompare(b.setor + b.nome));
    document.getElementById('loading-container').style.display = 'none';
    document.getElementById('table-wrapper').classList.remove('hidden');
    popularFiltros();
    atualizarDisplayMes();
}

function gerarEscala12x36(idColaborador, diaInicio) {
    const ano = currentDate.getFullYear();
    const mes = currentDate.getMonth();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const escala = {};
    let emPlantao = diaInicio === 'impar';
    for (let dia = 1; dia <= diasNoMes; dia++) {
        escala[dia] = emPlantao ? 'P' : 'F';
        emPlantao = !emPlantao;
    }
    return escala;
}

function gerarEscalasDoMes() {
    const mesKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
    if (!schedules[mesKey]) {
        schedules[mesKey] = {};
        reallocations[mesKey] = reallocations[mesKey] || {};
        allCollaborators.forEach(col => {
            const diaTipo = (parseInt(String(col.id).replace(/\D/g, '')) || 0) % 2 !== 0 ? 'impar' : 'par';
            schedules[mesKey][col.id] = gerarEscala12x36(col.id, diaTipo);
        });
    }
}

function carregarEscalasDoBanco() {
    const ano = currentDate.getFullYear();
    const mes = currentDate.getMonth();
    const mesKey = `${ano}-${mes}`;
    return fetch(`/api/staff/escalas?ano=${ano}&mes=${mes + 1}`)
        .then(r => r.json())
        .then(data => {
            const resp = data && data.escalas ? data : { escalas: data || {}, remanejamentos: data?.remanejamentos || {} };
            Object.keys(resp.escalas || {}).forEach(idFunc => {
                const id = String(idFunc);
                if (!schedules[mesKey]) schedules[mesKey] = {};
                if (!schedules[mesKey][id]) schedules[mesKey][id] = {};
                Object.assign(schedules[mesKey][id], resp.escalas[idFunc]);
            });
            Object.keys(resp.remanejamentos || {}).forEach(idFunc => {
                const id = String(idFunc);
                if (!reallocations[mesKey]) reallocations[mesKey] = {};
                if (!reallocations[mesKey][id]) reallocations[mesKey][id] = {};
                Object.assign(reallocations[mesKey][id], resp.remanejamentos[idFunc]);
            });
        })
        .catch(() => {});
}

function popularFiltros() {
    fetch('/api/staff/setores').then(r => r.json()).then(setores => {
        ['filtro-setor', 'ind-filtro-setor'].forEach(selId => {
            const sel = document.getElementById(selId);
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = '<option value="">Todos os Setores</option>';
            (setores || []).forEach(s => {
                const o = document.createElement('option');
                o.value = s.ds_setor || '';
                o.textContent = s.ds_setor;
                sel.appendChild(o);
            });
            if (current) sel.value = current;
        });
    });
    ['funcao', 'turno', 'escala'].forEach(campo => {
        const items = [...new Set(allCollaborators.map(c => c[campo]))].filter(Boolean).filter(x => x !== 'N/A').sort();
        const labels = { funcao: 'Todas as Profissões', turno: 'Todos (Diurno/Noturno)', escala: 'Todas as Escalas' };
        ['filtro-' + campo, 'ind-filtro-' + campo].forEach(selId => {
            const sel = document.getElementById(selId);
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = `<option value="">${labels[campo] || 'Todos'}</option>`;
            items.forEach(item => {
                const o = document.createElement('option');
                o.value = item;
                o.textContent = item;
                sel.appendChild(o);
            });
            if (current) sel.value = current;
        });
    });
}

let allFuncionarios = [];

function renderListaFuncionariosFiltered() {
    const tbody = document.getElementById('lista-funcionarios-body');
    const filtroSetor = document.getElementById('filtro-lista-setor')?.value || '';
    const filtroFuncao = document.getElementById('filtro-lista-funcao')?.value || '';
    if (!tbody) return;
    const lista = allFuncionarios.filter(f => {
        if (filtroSetor && (f.ds_setor || '') !== filtroSetor) return false;
        if (filtroFuncao && (f.ds_funcao || '') !== filtroFuncao) return false;
        return true;
    });
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">Nenhum funcionário encontrado.</td></tr>';
        return;
    }
    tbody.innerHTML = lista.map(f => {
        const situacao = f.dt_demissao ? '<span class="px-2 py-1 text-xs rounded bg-red-100 text-red-700">Demitido</span>' : '<span class="px-2 py-1 text-xs rounded bg-green-100 text-green-700">Ativo</span>';
        const botoesRemover = f.dt_demissao ? '' : ` <button type="button" class="btn-remover-funcionario px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md" data-id="${f.id}" data-nome="${(f.nm_funcionario || '').replace(/"/g, '&quot;')}">Remover</button>`;
        return `<tr class="hover:bg-gray-50">
            <td class="px-4 py-3 text-sm font-medium text-gray-900">${f.nm_funcionario || '-'}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${f.ds_setor || '-'}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${f.ds_funcao || '-'}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${normalizarTurno(f.ds_turno) || '-'}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${f.ds_escala || '-'}</td>
            <td class="px-4 py-3">${situacao}</td>
            <td class="px-4 py-3 text-right">
                <button type="button" class="btn-editar-funcionario px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-md" data-id="${f.id}">Editar</button>${botoesRemover}
            </td>
        </tr>`;
    }).join('');
}

function popularFiltrosListaFuncionarios() {
    const setores = [...new Set(allFuncionarios.map(f => f.ds_setor).filter(Boolean))].sort();
    const funcoes = [...new Set(allFuncionarios.map(f => f.ds_funcao).filter(Boolean))].sort();
    const selSetor = document.getElementById('filtro-lista-setor');
    const selFuncao = document.getElementById('filtro-lista-funcao');
    if (selSetor) {
        const cur = selSetor.value;
        selSetor.innerHTML = '<option value="">Todos os Setores</option>' + setores.map(s => `<option value="${s}">${s}</option>`).join('');
        if (cur) selSetor.value = cur;
    }
    if (selFuncao) {
        const cur = selFuncao.value;
        selFuncao.innerHTML = '<option value="">Todas as Profissões</option>' + funcoes.map(f => `<option value="${f}">${f}</option>`).join('');
        if (cur) selFuncao.value = cur;
    }
}

function carregarListaFuncionarios() {
    const tbody = document.getElementById('lista-funcionarios-body');
    if (!tbody) return;
    fetch('/api/staff/funcionarios').then(r => r.json()).then(lista => {
        allFuncionarios = lista || [];
        if (allFuncionarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">Nenhum funcionário cadastrado.</td></tr>';
            return;
        }
        popularFiltrosListaFuncionarios();
        renderListaFuncionariosFiltered();
    }).catch(() => { tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-red-500">Erro ao carregar.</td></tr>'; });
}

function popularSelectSetores(selectId, useIdAsValue, presetValue) {
    fetch('/api/staff/setores').then(r => r.json()).then(setores => {
        const sel = document.getElementById(selectId);
        const current = presetValue !== undefined ? presetValue : sel.value;
        sel.innerHTML = selectId === 'swap-setor' ? '<option value="">Selecione setor</option>' : selectId === 'reallocate-setor' ? '<option value="">Selecione novo setor</option>' : '<option value="">Selecione...</option>';
        (setores || []).forEach(s => {
            const o = document.createElement('option');
            o.value = (useIdAsValue !== false && selectId !== 'swap-setor') ? s.id : (s.ds_setor || '');
            o.textContent = s.ds_setor;
            sel.appendChild(o);
        });
        if (current) sel.value = current;
    });
}

function setStickyColumnPositions() { columnWidthsSet = true; }

function renderizarTabela() {
    columnWidthsSet = false;
    gerarEscalasDoMes();
    const ano = currentDate.getFullYear();
    const mes = currentDate.getMonth();
    const firstDayOfMonth = new Date(ano, mes, 1);
    const mesFormatado = String(mes + 1).padStart(2, '0');
    const mesKey = `${ano}-${mes}`;
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const headerBaseClasses = 'px-4 py-2 text-center text-xs font-medium text-purple-700 uppercase tracking-wider whitespace-nowrap';
    const filtros = { nome: document.getElementById('filtro-nome').value.toLowerCase(), setor: document.getElementById('filtro-setor').value, funcao: document.getElementById('filtro-funcao').value, turno: document.getElementById('filtro-turno').value, escala: document.getElementById('filtro-escala')?.value || '', diaTipo: document.getElementById('filtro-dia-tipo').value };

    const headerDaysHtml = Array.from({ length: diasNoMes }, (_, i) => {
        const dia = i + 1;
        const show = !filtros.diaTipo || (filtros.diaTipo === 'impar' && dia % 2 !== 0) || (filtros.diaTipo === 'par' && dia % 2 === 0);
        if (!show) return '';
        const date = new Date(ano, mes, dia);
        const dayOfWeek = date.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3);
        const holidayName = getHoliday(date);
        const holidayClass = holidayName ? 'bg-blue-100 holiday-header' : '';
        const titleAttr = holidayName ? `title="${holidayName}"` : '';
        return `<th scope="col" class="${headerBaseClasses} w-20 ${holidayClass}" ${titleAttr}><div>${dayOfWeek}</div><div>${String(dia).padStart(2, '0')}/${mesFormatado}</div></th>`;
    }).join('');

    document.getElementById('table-head').innerHTML = `<tr>
        <th scope="col" class="sticky-col-nome ${headerBaseClasses} text-left header-interactive col-nome" style="min-width:180px">Colaborador</th>
        <th scope="col" class="${headerBaseClasses} text-left header-interactive">Setor</th>
        <th scope="col" class="${headerBaseClasses} text-left header-interactive">Profissão</th>
        <th scope="col" class="${headerBaseClasses} text-left header-interactive">Turno</th>
        <th scope="col" class="${headerBaseClasses} text-left header-interactive">Escala</th>
        ${headerDaysHtml}
    </tr>`;

    const monthReallocations = reallocations[mesKey] || {};
    const groupedReallocations = {};
    Object.keys(monthReallocations).forEach(collabId => {
        const orig = allCollaborators.find(c => c.id === collabId);
        if (!orig) return;
        Object.keys(monthReallocations[collabId]).forEach(dia => {
            const r = monthReallocations[collabId][dia];
            const key = `${collabId}-${r.newSector}`;
            if (!groupedReallocations[key]) {
                groupedReallocations[key] = { ...orig, setor: r.newSector, isReallocated: true, originalSector: orig.setor, reallocatedDays: [] };
            }
            groupedReallocations[key].reallocatedDays.push(parseInt(dia));
        });
    });
    const reallocatedRows = Object.values(groupedReallocations);

    const finalList = [...allCollaborators, ...reallocatedRows].filter(c => {
        const dismissed = c.dismissalDate && new Date(c.dismissalDate) < firstDayOfMonth;
        if (dismissed) return false;
        return c.nome.toLowerCase().includes(filtros.nome) && (!filtros.setor || c.setor === filtros.setor) && (!filtros.funcao || c.funcao === filtros.funcao) && (!filtros.turno || c.turno === filtros.turno) && (!filtros.escala || c.escala === filtros.escala);
    }).sort((a, b) => (a.setor + a.nome).localeCompare(b.setor + b.nome));

    let visibleDays = 0;
    for (let i = 1; i <= diasNoMes; i++) {
        if (!filtros.diaTipo || (filtros.diaTipo === 'impar' && i % 2 !== 0) || (filtros.diaTipo === 'par' && i % 2 === 0)) visibleDays++;
    }
    const totalCols = 5 + visibleDays;

    if (finalList.length === 0) {
        document.getElementById('table-body').innerHTML = `<tr><td colspan="${totalCols}" class="text-center py-4 text-gray-500">Nenhum colaborador encontrado.</td></tr>`;
        return;
    }

    document.getElementById('table-body').innerHTML = finalList.map(colaborador => {
        const escala = schedules[mesKey][colaborador.id] || {};
        const diasHtml = Array.from({ length: diasNoMes }, (_, i) => {
            const dia = i + 1;
            const show = !filtros.diaTipo || (filtros.diaTipo === 'impar' && dia % 2 !== 0) || (filtros.diaTipo === 'par' && dia % 2 === 0);
            if (!show) return '';

            let status = '';
            if (colaborador.isReallocated) {
                if (colaborador.reallocatedDays.includes(dia)) status = 'R';
                else return `<td class="day-cell text-center text-xs px-2 py-3 bg-gray-50"></td>`;
            } else {
                const s = escala[dia];
                status = (typeof s === 'object' && s) ? s.status : s;
            }

            let statusClass = '', statusText = '', titleAttr = '';
            const sObj = escala[dia];
            if (typeof sObj === 'object' && sObj) titleAttr = ` title="${sObj.type || ''}\n${sObj.description || ''}" `;
            switch (status) {
                case 'P': statusText = 'Plantão'; statusClass = 'text-gray-800 font-medium'; break;
                case 'F': statusText = 'Folga'; statusClass = 'text-gray-400'; break;
                case 'FE': statusText = 'Férias'; statusClass = 'bg-blue-200 text-blue-800 font-bold'; break;
                case 'FO': statusText = 'Folga'; statusClass = 'bg-green-200 text-green-800 font-bold'; break;
                case 'SU': statusText = 'Suspenso'; statusClass = 'bg-red-200 text-red-800 font-bold'; break;
                case 'R': statusText = 'Remanejado'; statusClass = 'bg-orange-200 text-orange-800 font-bold'; const rd = reallocations[mesKey]?.[colaborador.id]?.[dia]?.newSector; if (rd) titleAttr = ` title="Remanejado para: ${rd}" `; break;
                case 'T_DOWN':
                case 'T_UP': statusText = status === 'T_DOWN' ? '↓ Troca' : 'Troca ↑'; statusClass = status === 'T_DOWN' ? 'bg-orange-200 text-orange-800 font-bold' : 'bg-cyan-200 text-cyan-800 font-bold'; const sw = swapLog[`${mesKey}-${dia}`]; if (sw) titleAttr = ` title="Troca: ${sw.from?.nome} ↔ ${sw.to?.nome}" `; break;
                case 'FJ': statusText = 'Falta Just.'; statusClass = 'bg-yellow-200 text-yellow-800 font-bold'; break;
                case 'FI': statusText = 'Falta Injust.'; statusClass = 'bg-red-300 text-red-900 font-bold'; break;
                case 'AS': statusText = 'Atestado'; statusClass = 'bg-teal-200 text-teal-800 font-bold'; break;
                case 'AO': statusText = 'Atest. Óbito'; statusClass = 'bg-gray-300 text-gray-800 font-bold'; break;
                default: statusText = status || ''; statusClass = 'text-gray-500';
            }
            return `<td class="day-cell text-center text-xs px-2 py-3 ${statusClass}" data-day="${dia}"${titleAttr}>${statusText}</td>`;
        }).join('');

        const setorCell = colaborador.isReallocated
            ? `<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 reallocated-sector" title="Origem: ${colaborador.originalSector}"><span class="h-2 w-2 bg-green-500 rounded-full inline-block mr-1"></span>${colaborador.setor}</td>`
            : `<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${colaborador.setor}</td>`;

        return `<tr data-id="${colaborador.id}" ${colaborador.isReallocated ? `data-reallocated-days="${colaborador.reallocatedDays.join(',')}"` : ''}><td class="sticky-col-nome px-4 py-3 text-sm font-medium text-gray-900 context-target truncate-name" style="max-width:180px" title="${(colaborador.nome || '').replace(/"/g, '&quot;')}">${colaborador.nome}</td>${setorCell}<td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 context-target">${colaborador.funcao}</td><td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 context-target">${normalizarTurno(colaborador.turno)}</td><td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 context-target">${colaborador.escala || 'N/A'}</td>${diasHtml}</tr>`;
    }).join('');

    setTimeout(setStickyColumnPositions, 0);
}

function atualizarDisplayMes() {
    document.getElementById('month-year').textContent = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
    columnWidthsSet = false;
    gerarEscalasDoMes();
    carregarEscalasDoBanco().then(() => {
        renderizarTabela();
        renderIndicadores();
    });
}

function showConfirmation(title, text, callback) {
    document.getElementById('confirmation-title').textContent = title;
    document.getElementById('confirmation-text').innerHTML = text;
    confirmationCallback = callback;
    document.getElementById('confirmation-modal').classList.remove('hidden');
}

function resetDateModal() {
    document.getElementById('end-date-wrapper').style.display = 'block';
    const saveBtn = document.getElementById('save-event');
    saveBtn.textContent = 'Salvar';
    saveBtn.className = 'flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-700';
    document.getElementById('start-date').value = '';
    document.getElementById('end-date').value = '';
    document.getElementById('modal-title').textContent = 'Agendar Evento';
}

function showToast(msg) {
    const toast = document.getElementById('toast-notification');
    toast.textContent = msg || 'Alterações salvas!';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function saveChanges() {
    const ano = currentDate.getFullYear();
    const mes = currentDate.getMonth();
    const demissoes = allCollaborators.filter(c => c.dismissalDate).map(c => ({ id_funcionario: c.id, dt_demissao: c.dismissalDate }));
    const mesKey = `${ano}-${mes}`;
    const reallocList = [];
    Object.keys(reallocations[mesKey] || {}).forEach(cid => {
        Object.keys(reallocations[mesKey][cid]).forEach(dia => {
            const r = reallocations[mesKey][cid][dia];
            reallocList.push({ id_funcionario: cid, ano, mes: mes + 1, dia: parseInt(dia), id_setor_destino: r.newSectorId || null });
        });
    });

    fetch('/api/staff/escala', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ano, mes: mes + 1, escalas: schedules[mesKey], reallocations: reallocList, demissoes })
    }).then(r => r.json()).then(data => {
        if (data.sucesso) showToast('Alterações salvas com sucesso!');
        else showToast('Erro: ' + (data.erro || 'Falha ao salvar'));
    }).catch(err => showToast('Erro: ' + err.message));
}

const HORAS_POR_ESCALA = { '12x36': 12, '24x48': 24, '6x1': 8, '5x2': 8 };

function calcularHorasColaborador(colaborador, monthSchedule) {
    const escala = colaborador.escala || '12x36';
    const horasPorPlantao = HORAS_POR_ESCALA[escala] ?? 12;
    const sc = monthSchedule || {};
    let plantoes = 0;
    Object.values(sc).forEach(st => {
        const s = (typeof st === 'object' && st) ? st.status : st;
        if (s === 'P') plantoes++;
    });
    return plantoes * horasPorPlantao;
}

function getIndicadoresFiltrados() {
    const nome = (document.getElementById('ind-filtro-nome')?.value || '').toLowerCase();
    const setor = document.getElementById('ind-filtro-setor')?.value || '';
    const funcao = document.getElementById('ind-filtro-funcao')?.value || '';
    const turno = document.getElementById('ind-filtro-turno')?.value || '';
    const escala = document.getElementById('ind-filtro-escala')?.value || '';
    return allCollaborators.filter(c => {
        if (nome && !(c.nome || '').toLowerCase().includes(nome)) return false;
        if (setor && c.setor !== setor) return false;
        if (funcao && c.funcao !== funcao) return false;
        if (turno && c.turno !== turno) return false;
        if (escala && c.escala !== escala) return false;
        return true;
    });
}

function renderIndicadores() {
    const colaboradoresFiltrados = getIndicadoresFiltrados();
    if (!allCollaborators.length) return;
    const mesKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
    const monthSchedules = schedules[mesKey] || {};
    let totalFerias = 0, totalFaltas = 0, totalSuspensoes = 0, totalHoras = 0;
    const plantoesPorSetor = {};
    const ocorrenciasPorTipo = {};
    const ocorrenciasPorSetor = {};
    const horasPorColaborador = [];

    colaboradoresFiltrados.forEach(c => {
        const sc = monthSchedules[c.id] || {};
        plantoesPorSetor[c.setor] = (plantoesPorSetor[c.setor] || 0);
        ocorrenciasPorSetor[c.setor] = (ocorrenciasPorSetor[c.setor] || 0);
        const horas = calcularHorasColaborador(c, sc);
        totalHoras += horas;
        horasPorColaborador.push({ nome: c.nome, setor: c.setor, escala: c.escala || '12x36', horas });
        Object.values(sc).forEach(st => {
            const s = (typeof st === 'object' && st) ? st.status : st;
            if (s === 'P') plantoesPorSetor[c.setor]++;
            else if (occurrenceNames[s]) {
                ocorrenciasPorTipo[occurrenceNames[s]] = (ocorrenciasPorTipo[occurrenceNames[s]] || 0) + 1;
                ocorrenciasPorSetor[c.setor]++;
                if (s === 'FE') totalFerias++;
                if (s === 'SU') totalSuspensoes++;
                if (s === 'FJ' || s === 'FI') totalFaltas++;
            }
        });
    });

    document.getElementById('kpi-container').innerHTML = `
        <div class="bg-white p-5 rounded-lg border border-gray-200"><p class="text-sm text-gray-600">Total de Colaboradores</p><p class="text-2xl font-bold">${colaboradoresFiltrados.length}</p></div>
        <div class="bg-white p-5 rounded-lg border border-gray-200"><p class="text-sm text-gray-600">Total de Horas no Mês</p><p class="text-2xl font-bold">${totalHoras}h</p></div>
        <div class="bg-white p-5 rounded-lg border border-gray-200"><p class="text-sm text-gray-600">Férias no Mês</p><p class="text-2xl font-bold">${totalFerias}</p></div>
        <div class="bg-white p-5 rounded-lg border border-gray-200"><p class="text-sm text-gray-600">Faltas no Mês</p><p class="text-2xl font-bold">${totalFaltas}</p></div>
        <div class="bg-white p-5 rounded-lg border border-gray-200"><p class="text-sm text-gray-600">Suspensões no Mês</p><p class="text-2xl font-bold">${totalSuspensoes}</p></div>
    `;

    const setoresCount = colaboradoresFiltrados.reduce((acc, c) => { acc[c.setor] = (acc[c.setor] || 0) + 1; return acc; }, {});
    const escalasCount = colaboradoresFiltrados.reduce((acc, c) => { const e = c.escala || 'N/A'; acc[e] = (acc[e] || 0) + 1; return acc; }, {});
    const chartColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
    const barChartDefaults = {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 10, right: 15, bottom: 5, left: 5 } },
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0, font: { size: 11 } } },
            y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { size: 11 } } }
        }
    };
    const pieChartDefaults = {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 5, right: 10, bottom: 5, left: 10 } },
        plugins: {
            legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 11 } } },
            tooltip: { callbacks: { label: ctx => ctx.label + ': ' + ctx.raw + ' (' + (ctx.raw / ctx.dataset.data.reduce((a, b) => a + b, 0) * 100).toFixed(1) + '%)' } }
        }
    };

    const renderChart = (id, type, labels, data, label) => {
        if (charts[id]) charts[id].destroy();
        const ctx = document.getElementById(id)?.getContext('2d');
        if (!ctx) return;
        const isPie = type === 'pie' || type === 'doughnut';
        charts[id] = new Chart(ctx, {
            type: type === 'pie' ? 'doughnut' : type,
            data: {
                labels,
                datasets: [{
                    label: label || '',
                    data,
                    backgroundColor: chartColors.slice(0, Math.max(labels.length, 4)),
                    borderWidth: isPie ? 2 : 0,
                    borderColor: '#fff',
                    hoverOffset: isPie ? 8 : 0
                }]
            },
            options: isPie ? pieChartDefaults : barChartDefaults
        });
    };

    renderChart('setor-chart', 'pie', Object.keys(setoresCount), Object.values(setoresCount));
    renderChart('escala-chart', 'pie', Object.keys(escalasCount), Object.values(escalasCount));
    renderChart('plantoes-chart', 'bar', Object.keys(plantoesPorSetor), Object.values(plantoesPorSetor), 'Plantões');
    renderChart('ocorrencias-tipo-chart', 'bar', Object.keys(ocorrenciasPorTipo), Object.values(ocorrenciasPorTipo), 'Ocorrências');
    renderChart('ocorrencias-setor-chart', 'bar', Object.keys(ocorrenciasPorSetor), Object.values(ocorrenciasPorSetor), 'Ocorrências');

    const horasTable = document.getElementById('horas-colaboradores-table');
    if (horasTable) {
        horasPorColaborador.sort((a, b) => (a.setor + a.nome).localeCompare(b.setor + b.nome));
        horasTable.innerHTML = horasPorColaborador.length === 0 ? '<p class="text-gray-500 text-sm">Nenhum colaborador.</p>' : `
            <div class="overflow-x-auto max-h-64 overflow-y-auto">
                <table class="min-w-full text-sm">
                    <thead class="bg-gray-50 sticky top-0"><tr><th class="px-3 py-2 text-left">Colaborador</th><th class="px-3 py-2 text-left">Setor</th><th class="px-3 py-2 text-left">Escala</th><th class="px-3 py-2 text-right">Horas/mês</th></tr></thead>
                    <tbody class="divide-y divide-gray-200">${horasPorColaborador.map(r => `<tr><td class="px-3 py-2">${r.nome}</td><td class="px-3 py-2">${r.setor}</td><td class="px-3 py-2">${r.escala}</td><td class="px-3 py-2 text-right font-medium">${r.horas}h</td></tr>`).join('')}</tbody>
                </table>
            </div>`;
    }
}

function executeSwap(origId, origDay, coveringId, coveringDay) {
    const mesKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
    if (schedules[mesKey]) {
        schedules[mesKey][origId][origDay] = 'T_DOWN';
        schedules[mesKey][coveringId][coveringDay] = 'T_UP';
        const o = allCollaborators.find(c => c.id === origId);
        const c = allCollaborators.find(c => c.id === coveringId);
        const m = String(currentDate.getMonth() + 1).padStart(2, '0');
        const y = currentDate.getFullYear();
        const d = { from: o, to: c, fromDate: `${String(origDay).padStart(2, '0')}/${m}/${y}`, toDate: `${String(coveringDay).padStart(2, '0')}/${m}/${y}` };
        swapLog[`${mesKey}-${origDay}`] = d;
        swapLog[`${mesKey}-${coveringDay}`] = d;
    }
    renderizarTabela();
}

function executeUndoSwap() {
    const mesKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
    const swapInfo = swapLog[`${mesKey}-${selectedDay}`];
    if (!swapInfo || !schedules[mesKey]) return;
    const day1 = parseInt(swapInfo.fromDate.split('/')[0]);
    const day2 = parseInt(swapInfo.toDate.split('/')[0]);
    const orig1 = gerarEscala12x36(swapInfo.from.id, (parseInt(String(swapInfo.from.id).replace(/\D/g, '')) || 0) % 2 !== 0 ? 'impar' : 'par');
    const orig2 = gerarEscala12x36(swapInfo.to.id, (parseInt(String(swapInfo.to.id).replace(/\D/g, '')) || 0) % 2 !== 0 ? 'impar' : 'par');
    if (schedules[mesKey][swapInfo.from.id]) schedules[mesKey][swapInfo.from.id][day1] = orig1[day1];
    if (schedules[mesKey][swapInfo.to.id]) schedules[mesKey][swapInfo.to.id][day2] = orig2[day2];
    delete swapLog[`${mesKey}-${day1}`];
    delete swapLog[`${mesKey}-${day2}`];
    renderizarTabela();
}

function toggleDayStatus() {
    const mesKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
    if (!schedules[mesKey] || !selectedCollaboratorId || !selectedDay) return;
    const cur = schedules[mesKey][selectedCollaboratorId][selectedDay];
    schedules[mesKey][selectedCollaboratorId][selectedDay] = cur === 'P' ? 'F' : 'P';
    renderizarTabela();
}

function applySchedule() {
    const startStr = document.getElementById('schedule-start-date').value;
    if (!startStr) { alert('Selecione uma data de início.'); return; }
    const startDate = new Date(startStr + 'T00:00:00');
    const ano = currentDate.getFullYear();
    const mes = currentDate.getMonth();
    if (startDate.getFullYear() !== ano || startDate.getMonth() !== mes) { alert('A data deve ser do mês atual.'); return; }
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const mesKey = `${ano}-${mes}`;
    const filtros = { nome: document.getElementById('filtro-nome').value.toLowerCase(), setor: document.getElementById('filtro-setor').value, funcao: document.getElementById('filtro-funcao').value, turno: document.getElementById('filtro-turno').value, escala: document.getElementById('filtro-escala')?.value || '' };
    const toUpdate = isBulkScheduleMode ? allCollaborators.filter(c => c.nome.toLowerCase().includes(filtros.nome) && (!filtros.setor || c.setor === filtros.setor) && (!filtros.funcao || c.funcao === filtros.funcao) && (!filtros.turno || c.turno === filtros.turno) && (!filtros.escala || c.escala === filtros.escala)) : allCollaborators.filter(c => c.id === selectedCollaboratorId);
    let isPlantao = true;
    toUpdate.forEach(c => {
        for (let dia = startDate.getDate(); dia <= diasNoMes; dia++) {
            schedules[mesKey][c.id][dia] = isPlantao ? 'P' : 'F';
            isPlantao = !isPlantao;
        }
    });
    document.getElementById('set-schedule-modal').classList.add('hidden');
    renderizarTabela();
}

function initEscalas() {
    const tabsContainer = document.getElementById('tabs');
    const tabContents = document.querySelectorAll('.tab-content');
    const collabMenu = document.getElementById('collab-context-menu');
    const dayMenu = document.getElementById('day-context-menu');

    tabsContainer?.addEventListener('click', e => {
        const btn = e.target.closest('.tab-button');
        if (!btn) return;
        const tab = btn.dataset.tab;
        tabsContainer.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tabContents.forEach(c => {
            c.classList.toggle('hidden', c.id !== `tab-content-${tab}`);
        });
        if (tab === 'cadastro') carregarListaFuncionarios();
        if (tab === 'indicadores') { popularFiltros(); renderIndicadores(); }
    });

    ['filtro-lista-setor', 'filtro-lista-funcao'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', renderListaFuncionariosFiltered);
    });

    document.getElementById('tab-content-cadastro')?.addEventListener('click', e => {
        const removerBtn = e.target.closest('.btn-remover-funcionario');
        if (removerBtn) {
            const id = removerBtn.dataset.id;
            const nome = removerBtn.dataset.nome || 'este funcionário';
            if (!id) return;
            if (!confirm('Tem certeza que deseja remover (desligar) ' + nome + '? Ele não aparecerá mais no Painel de Escalas.')) return;
            fetch('/api/staff/funcionario/' + id, { method: 'DELETE' })
                .then(r => r.json())
                .then(data => {
                    if (data.sucesso) {
                        showToast('Funcionário removido da lista.');
                        carregarListaFuncionarios();
                        fetch('/api/staff/colaboradores').then(r => r.json()).then(initializeDashboard);
                    } else alert('Erro: ' + (data.erro || 'Falha'));
                })
                .catch(err => alert('Erro: ' + err.message));
            return;
        }
        const editBtn = e.target.closest('.btn-editar-funcionario');
        if (!editBtn) return;
        const id = editBtn.dataset.id;
        if (!id) return;
        fetch('/api/staff/funcionario/' + id).then(r => r.json()).then(func => {
            document.getElementById('modal-funcionario-titulo').textContent = 'Editar Funcionário';
            document.getElementById('func-id').value = id;
            document.getElementById('func-nome').value = func.nm_funcionario || '';
            document.getElementById('func-busca-usuario').closest('.relative')?.classList.add('hidden');
            document.getElementById('func-busca-usuario').value = '';
            document.getElementById('func-cd-usuario').value = '';
            popularSelectSetores('func-setor', true, func.id_setor || '');
            const selFuncao = document.getElementById('func-funcao');
            selFuncao.innerHTML = '<option value="">Selecione a profissão...</option>' + PROFISSOES_SETOR.map(p => `<option value="${p}">${p}</option>`).join('');
            selFuncao.value = func.ds_funcao || '';
            document.getElementById('func-turno').value = (func.ds_turno === 'Diurno' || func.ds_turno === 'Noturno') ? func.ds_turno : 'Diurno';
            document.getElementById('func-escala').value = (['6x1','5x2','12x36','24x48'].includes(func.ds_escala || '')) ? func.ds_escala : '12x36';
            document.getElementById('modal-funcionario').classList.remove('hidden');
        });
    });

    document.getElementById('prev-month')?.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); atualizarDisplayMes(); });
    document.getElementById('next-month')?.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); atualizarDisplayMes(); });
    ['filtro-nome', 'filtro-setor', 'filtro-funcao', 'filtro-turno', 'filtro-escala', 'filtro-dia-tipo'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderizarTabela);
        document.getElementById(id)?.addEventListener('change', renderizarTabela);
    });
    ['ind-filtro-nome', 'ind-filtro-setor', 'ind-filtro-funcao', 'ind-filtro-turno', 'ind-filtro-escala'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderIndicadores);
        document.getElementById(id)?.addEventListener('change', renderIndicadores);
    });
    document.getElementById('save-all-changes')?.addEventListener('click', saveChanges);

    document.getElementById('table-head')?.addEventListener('click', e => {
        if (e.target.closest('.header-interactive')) {
            isBulkScheduleMode = true;
            document.getElementById('set-schedule-modal-title').textContent = 'Definir Plantões em Massa';
            document.getElementById('set-schedule-modal').classList.remove('hidden');
        }
    });

    document.getElementById('table-body')?.addEventListener('contextmenu', e => {
        e.preventDefault();
        const collabTarget = e.target.closest('.context-target');
        const dayTarget = e.target.closest('.day-cell');
        collabMenu.style.display = 'none';
        dayMenu.style.display = 'none';
        if (collabTarget) {
            const row = e.target.closest('tr');
            if (row.dataset.reallocatedDays) return;
            selectedCollaboratorId = row.dataset.id;
            collabMenu.style.top = e.pageY + 'px';
            collabMenu.style.left = e.pageX + 'px';
            collabMenu.style.display = 'block';
        } else if (dayTarget) {
            const row = e.target.closest('tr');
            if (row.dataset.reallocatedDays) return;
            selectedCollaboratorId = row.dataset.id;
            selectedDay = e.target.dataset.day;
            const mesKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
            const s = schedules[mesKey]?.[selectedCollaboratorId]?.[selectedDay];
            const status = (typeof s === 'object' && s) ? s.status : s;
            dayMenu.querySelectorAll('li').forEach(li => li.style.display = 'none');
            if (status === 'P' || status === 'F') {
                dayMenu.querySelector('[data-action="TROCA"]')?.closest('li')?.style?.setProperty('display', 'block');
                dayMenu.querySelector('[data-action="REMANEJAR"]')?.closest('li')?.style?.setProperty('display', 'block');
                dayMenu.querySelector('[data-action="TOGGLE_STATUS"]')?.closest('li')?.style?.setProperty('display', 'block');
            } else if (status === 'T_UP' || status === 'T_DOWN') {
                dayMenu.querySelector('[data-action="UNDO_SWAP"]')?.closest('li')?.style?.setProperty('display', 'block');
            }
            dayMenu.style.top = e.pageY + 'px';
            dayMenu.style.left = e.pageX + 'px';
            dayMenu.style.display = 'block';
        }
    });

    window.addEventListener('click', e => {
        if (!e.target.closest('.context-menu') && !e.target.closest('.context-target') && !e.target.closest('.day-cell')) {
            collabMenu.style.display = 'none';
            dayMenu.style.display = 'none';
        }
        if (!e.target.closest('#export-btn') && !e.target.closest('#export-menu')) {
            document.getElementById('export-menu')?.classList.add('hidden');
        }
    });

    collabMenu?.addEventListener('click', e => {
        e.preventDefault();
        const action = e.target.dataset.action;
        collabMenu.style.display = 'none';
        selectedAction = action;
        if (['FE', 'FO', 'SU'].includes(action)) {
            document.getElementById('modal-title').textContent = 'Agendar ' + actionNames[action];
            document.getElementById('date-modal').classList.remove('hidden');
        } else if (action === 'ABSENCE') {
            document.getElementById('absence-modal-title').innerHTML = 'Lançar Ausência para<br><span class="text-gray-600">' + (allCollaborators.find(c => c.id === selectedCollaboratorId)?.nome || '') + '</span>';
            document.getElementById('absence-start-date').value = '';
            document.getElementById('absence-end-date').value = '';
            document.getElementById('absence-type').value = 'FJ';
            document.getElementById('absence-description').value = '';
            document.getElementById('absence-modal').classList.remove('hidden');
        } else if (action === 'SET_SCHEDULE') {
            isBulkScheduleMode = false;
            const collab = allCollaborators.find(c => c.id === selectedCollaboratorId);
            document.getElementById('set-schedule-modal-title').innerHTML = 'Definir Plantões para<br><span class="font-normal">' + (collab?.nome || '') + '</span>';
            document.getElementById('set-schedule-modal').classList.remove('hidden');
        } else if (action === 'DE') {
            document.getElementById('modal-title').textContent = 'Registrar Demissão';
            document.getElementById('end-date-wrapper').style.display = 'none';
            const saveBtn = document.getElementById('save-event');
            saveBtn.textContent = 'Confirmar Demissão';
            saveBtn.className = 'flex-1 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-700';
            document.getElementById('date-modal').classList.remove('hidden');
        }
    });

    dayMenu?.addEventListener('click', e => {
        e.preventDefault();
        const action = e.target.dataset.action;
        dayMenu.style.display = 'none';
        if (action === 'TROCA') {
            document.getElementById('swap-modal-title').innerHTML = 'Realizar Troca<br><span class="text-gray-600">' + (allCollaborators.find(c => c.id === selectedCollaboratorId)?.nome || '') + '</span>';
            popularSelectSetores('swap-setor');
            document.getElementById('swap-colaborador').innerHTML = '<option value="">Selecione colaborador</option>';
            document.getElementById('swap-date').value = '';
            document.getElementById('swap-modal').classList.remove('hidden');
        } else if (action === 'REMANEJAR') {
            const collab = allCollaborators.find(c => c.id === selectedCollaboratorId);
            const m = String(currentDate.getMonth() + 1).padStart(2, '0');
            document.getElementById('reallocate-info').innerHTML = 'Remanejando <strong>' + (collab?.nome || '') + '</strong> no dia <strong>' + String(selectedDay).padStart(2, '0') + '/' + m + '/' + currentDate.getFullYear() + '</strong>';
            fetch('/api/staff/setores').then(r => r.json()).then(setores => {
                const sel = document.getElementById('reallocate-setor');
                sel.innerHTML = '<option value="">Selecione novo setor</option>';
                (setores || []).filter(s => s.ds_setor !== collab?.setor).forEach(s => {
                    const o = document.createElement('option');
                    o.value = s.id;
                    o.textContent = s.ds_setor;
                    sel.appendChild(o);
                });
            });
            document.getElementById('reallocate-modal').classList.remove('hidden');
        } else if (action === 'UNDO_SWAP') {
            showConfirmation('Desfazer Troca', 'Tem certeza que deseja desfazer esta troca?', executeUndoSwap);
        } else if (action === 'TOGGLE_STATUS') {
            toggleDayStatus();
        }
    });

    document.getElementById('save-event')?.addEventListener('click', () => {
        const startStr = document.getElementById('start-date').value;
        const endStr = document.getElementById('end-date').value;
        if (selectedAction === 'DE') {
            const dt = new Date(startStr + 'T00:00:00');
            const collab = allCollaborators.find(c => c.id === selectedCollaboratorId);
            if (collab) {
                collab.dismissalDate = dt;
                const ano = dt.getFullYear(), mes = dt.getMonth(), diasNoMes = new Date(ano, mes + 1, 0).getDate();
                const mesKey = `${ano}-${mes}`;
                if (schedules[mesKey]?.[selectedCollaboratorId]) {
                    for (let d = dt.getDate(); d <= diasNoMes; d++) schedules[mesKey][selectedCollaboratorId][d] = '';
                }
            }
        } else if (['FE', 'FO', 'SU'].includes(selectedAction)) {
            const start = new Date(startStr + 'T00:00:00');
            const end = new Date(endStr + 'T00:00:00');
            if (start > end) { alert('Período inválido.'); return; }
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const mk = `${d.getFullYear()}-${d.getMonth()}`;
                if (schedules[mk]?.[selectedCollaboratorId]) schedules[mk][selectedCollaboratorId][d.getDate()] = selectedAction;
            }
        }
        document.getElementById('date-modal').classList.add('hidden');
        resetDateModal();
        renderizarTabela();
    });

    document.getElementById('cancel-event')?.addEventListener('click', () => { document.getElementById('date-modal').classList.add('hidden'); resetDateModal(); });

    document.getElementById('save-absence')?.addEventListener('click', () => {
        const start = new Date(document.getElementById('absence-start-date').value + 'T00:00:00');
        const end = new Date(document.getElementById('absence-end-date').value + 'T00:00:00');
        const type = document.getElementById('absence-type').value;
        const desc = document.getElementById('absence-description').value;
        if (start > end) { alert('Período inválido.'); return; }
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const mk = `${d.getFullYear()}-${d.getMonth()}`;
            if (schedules[mk]?.[selectedCollaboratorId]) schedules[mk][selectedCollaboratorId][d.getDate()] = { status: type, type: document.getElementById('absence-type').options[document.getElementById('absence-type').selectedIndex].text, description: desc };
        }
        document.getElementById('absence-modal').classList.add('hidden');
        renderizarTabela();
    });
    document.getElementById('cancel-absence')?.addEventListener('click', () => document.getElementById('absence-modal').classList.add('hidden'));

    document.getElementById('swap-setor')?.addEventListener('change', () => {
        const setorNome = document.getElementById('swap-setor').value;
        const orig = allCollaborators.find(c => c.id === selectedCollaboratorId);
        const sel = document.getElementById('swap-colaborador');
        sel.innerHTML = '<option value="">Selecione colaborador</option>';
        if (!setorNome || !orig) return;
        allCollaborators.filter(c => c.id !== orig.id && c.setor === setorNome && c.funcao === orig.funcao).forEach(c => {
            const o = document.createElement('option');
            o.value = c.id;
            o.textContent = c.nome;
            sel.appendChild(o);
        });
    });

    document.getElementById('propose-swap')?.addEventListener('click', () => {
        const coveringId = document.getElementById('swap-colaborador').value;
        const coveringDateStr = document.getElementById('swap-date').value;
        const orig = allCollaborators.find(c => c.id === selectedCollaboratorId);
        const covering = allCollaborators.find(c => c.id === coveringId);
        if (!covering || !orig || !selectedDay || !coveringDateStr) { alert('Preencha todos os campos.'); return; }
        const coveringDay = new Date(coveringDateStr + 'T00:00:00').getDate();
        executeSwap(orig.id, parseInt(selectedDay), covering.id, coveringDay);
        document.getElementById('swap-modal').classList.add('hidden');
    });
    document.getElementById('cancel-swap')?.addEventListener('click', () => document.getElementById('swap-modal').classList.add('hidden'));

    document.getElementById('save-reallocation')?.addEventListener('click', () => {
        const sel = document.getElementById('reallocate-setor');
        const newSectorName = sel.options[sel.selectedIndex]?.text;
        if (!newSectorName) { alert('Selecione o novo setor.'); return; }
        const mesKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
        if (!reallocations[mesKey]) reallocations[mesKey] = {};
        if (!reallocations[mesKey][selectedCollaboratorId]) reallocations[mesKey][selectedCollaboratorId] = {};
        reallocations[mesKey][selectedCollaboratorId][selectedDay] = { newSector: newSectorName, newSectorId: parseInt(document.getElementById('reallocate-setor').value) || null };
        const mesSched = schedules[mesKey];
        if (mesSched && mesSched[selectedCollaboratorId]) mesSched[selectedCollaboratorId][selectedDay] = 'R';
        document.getElementById('reallocate-modal').classList.add('hidden');
        renderizarTabela();
    });
    document.getElementById('cancel-reallocation')?.addEventListener('click', () => document.getElementById('reallocate-modal').classList.add('hidden'));

    document.getElementById('save-schedule')?.addEventListener('click', applySchedule);
    document.getElementById('cancel-schedule')?.addEventListener('click', () => document.getElementById('set-schedule-modal').classList.add('hidden'));

    document.getElementById('confirm-btn')?.addEventListener('click', () => { if (confirmationCallback) confirmationCallback(); document.getElementById('confirmation-modal').classList.add('hidden'); confirmationCallback = null; });
    document.getElementById('cancel-confirmation-btn')?.addEventListener('click', () => { document.getElementById('confirmation-modal').classList.add('hidden'); confirmationCallback = null; });

    document.getElementById('export-btn')?.addEventListener('click', () => document.getElementById('export-menu').classList.toggle('hidden'));
    document.getElementById('export-xlsx')?.addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('export-menu').classList.add('hidden');
        try {
            const lib = typeof XLSX !== 'undefined' ? XLSX : (typeof window !== 'undefined' && window.XLSX);
            if (!lib) { alert('Biblioteca XLSX não carregada.'); return; }
            const table = document.querySelector('#table-wrapper table');
            if (!table) { alert('Nenhuma tabela de escala para exportar.'); return; }
            const rows = [];
            const theadRow = table.querySelector('thead tr');
            if (theadRow) rows.push([...theadRow.querySelectorAll('th')].map(th => th.textContent.trim().replace(/\s+/g, ' ')));
            table.querySelectorAll('tbody tr').forEach(tr => rows.push([...tr.querySelectorAll('td')].map(td => td.textContent.trim())));
            if (rows.length < 2) { alert('Nenhum dado para exportar.'); return; }
            const wb = lib.utils.book_new();
            const ws = lib.utils.aoa_to_sheet(rows);
            lib.utils.book_append_sheet(wb, ws, 'Escala');
            const mes = String(currentDate.getMonth() + 1).padStart(2, '0');
            const ano = currentDate.getFullYear();
            lib.writeFile(wb, 'escala-' + mes + '-' + ano + '.xlsx');
        } catch (err) { alert('Erro ao exportar: ' + (err.message || err)); }
    });
    document.getElementById('export-pdf')?.addEventListener('click', e => { e.preventDefault(); alert('Exportar PDF em desenvolvimento.'); document.getElementById('export-menu').classList.add('hidden'); });
    document.getElementById('export-xml')?.addEventListener('click', e => { e.preventDefault(); alert('Exportar XML em desenvolvimento.'); document.getElementById('export-menu').classList.add('hidden'); });

    let funcUsuarioSearchTimeout = null;
    document.getElementById('func-busca-usuario')?.addEventListener('input', () => {
        clearTimeout(funcUsuarioSearchTimeout);
        const q = document.getElementById('func-busca-usuario').value.trim();
        const dd = document.getElementById('func-usuarios-dropdown');
        if (!q) { dd.classList.add('hidden'); dd.innerHTML = ''; return; }
        funcUsuarioSearchTimeout = setTimeout(() => {
            fetch('/api/staff/usuarios?q=' + encodeURIComponent(q))
                .then(r => r.json())
                .then(usuarios => {
                    dd.innerHTML = (usuarios || []).length === 0
                        ? '<div class="px-3 py-2 text-sm text-gray-500">Nenhum usuário encontrado</div>'
                        : usuarios.map(u => {
                            const nome = u.ds_usuario || u.nm_pessoa_fisica || u.nm_usuario || '';
                            return `<div class="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-0" data-id="${u.cd_usuario}" data-nome="${(nome || '').replace(/"/g, '&quot;')}">${nome || u.nm_usuario} <span class="text-gray-400 text-xs">@${u.nm_usuario || ''}</span></div>`;
                        }).join('');
                    dd.classList.remove('hidden');
                })
                .catch(() => { dd.innerHTML = '<div class="px-3 py-2 text-sm text-red-500">Erro ao buscar</div>'; dd.classList.remove('hidden'); });
        }, 300);
    });
    document.getElementById('func-usuarios-dropdown')?.addEventListener('click', (e) => {
        const el = e.target.closest('[data-id]');
        if (!el) return;
        document.getElementById('func-nome').value = el.dataset.nome || '';
        document.getElementById('func-cd-usuario').value = el.dataset.id || '';
        document.getElementById('func-busca-usuario').value = '';
        document.getElementById('func-usuarios-dropdown').classList.add('hidden');
        document.getElementById('func-usuarios-dropdown').innerHTML = '';
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#func-busca-usuario') && !e.target.closest('#func-usuarios-dropdown')) {
            document.getElementById('func-usuarios-dropdown')?.classList.add('hidden');
        }
    });

    document.getElementById('btn-novo-funcionario')?.addEventListener('click', () => {
        document.getElementById('modal-funcionario-titulo').textContent = 'Novo Funcionário';
        document.getElementById('func-id').value = '';
        document.getElementById('func-busca-usuario').closest('.relative')?.classList.remove('hidden');
        popularSelectSetores('func-setor');
        document.getElementById('func-nome').value = '';
        document.getElementById('func-busca-usuario').value = '';
        document.getElementById('func-cd-usuario').value = '';
        document.getElementById('func-usuarios-dropdown').classList.add('hidden');
        document.getElementById('func-usuarios-dropdown').innerHTML = '';
        const selFuncao = document.getElementById('func-funcao');
        selFuncao.innerHTML = '<option value="">Selecione a profissão...</option>' + PROFISSOES_SETOR.map(p => `<option value="${p}">${p}</option>`).join('');
        selFuncao.value = '';
        document.getElementById('func-turno').value = 'Diurno';
        document.getElementById('func-escala').value = '12x36';
        document.getElementById('modal-funcionario').classList.remove('hidden');
    });
    document.getElementById('cancel-funcionario')?.addEventListener('click', () => document.getElementById('modal-funcionario').classList.add('hidden'));
    document.getElementById('save-funcionario')?.addEventListener('click', () => {
        const id = document.getElementById('func-id').value;
        const nome = document.getElementById('func-nome').value.trim();
        const funcao = document.getElementById('func-funcao').value;
        if (!nome) { alert('Informe o nome.'); return; }
        if (!funcao) { alert('Selecione a profissão.'); return; }
        const payload = {
            nm_funcionario: nome,
            id_setor: document.getElementById('func-setor').value || null,
            ds_funcao: funcao,
            ds_turno: document.getElementById('func-turno').value || 'Diurno',
            ds_escala: document.getElementById('func-escala').value || '12x36'
        };
        if (!id) payload.cd_usuario = document.getElementById('func-cd-usuario')?.value || null;
        const url = id ? '/api/staff/funcionario/' + id : '/api/staff/funcionario';
        const method = id ? 'PUT' : 'POST';
        fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(r => r.json()).then(data => {
                if (data.sucesso) {
                    document.getElementById('modal-funcionario').classList.add('hidden');
                    carregarListaFuncionarios();
                    fetch('/api/staff/colaboradores').then(r => r.json()).then(initializeDashboard);
                } else alert('Erro: ' + (data.erro || 'Falha'));
            });
    });

    document.getElementById('btn-novo-setor')?.addEventListener('click', () => {
        document.getElementById('setor-nome').value = '';
        const grid = document.getElementById('setor-profissoes-grid');
        grid.innerHTML = PROFISSOES_SETOR.map(p => `
            <div class="flex flex-col gap-0.5">
                <label class="text-xs font-medium text-gray-600">${p}</label>
                <input type="number" class="setor-prof-qty block w-full rounded-md border-gray-300 shadow-sm text-sm" data-profissao="${p}" value="0" min="0" max="99">
            </div>
        `).join('');
        document.getElementById('modal-setor').classList.remove('hidden');
    });
    document.getElementById('cancel-setor')?.addEventListener('click', () => document.getElementById('modal-setor').classList.add('hidden'));
    document.getElementById('save-setor')?.addEventListener('click', () => {
        const nome = document.getElementById('setor-nome').value.trim();
        if (!nome) { alert('Informe o nome do setor.'); return; }
        const profissoes = Array.from(document.querySelectorAll('.setor-prof-qty')).map(inp => ({
            profissao: inp.dataset.profissao,
            qt_minima: Math.max(0, parseInt(inp.value) || 0)
        }));
        fetch('/api/staff/setor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ds_setor: nome, profissoes_minimas: profissoes })
        }).then(r => r.json()).then(data => {
            if (data.sucesso) {
                document.getElementById('modal-setor').classList.add('hidden');
                popularSelectSetores('func-setor');
                popularFiltros();
            } else alert('Erro: ' + (data.erro || 'Falha'));
        });
    });

    fetch('/api/staff/colaboradores')
        .then(r => r.json())
        .then(data => data && data.length > 0 ? initializeDashboard(data) : (document.getElementById('loading-container').innerHTML = '<p class="text-gray-500">Nenhum colaborador encontrado. Cadastre funcionários na aba Cadastro.</p>'))
        .catch(err => { console.error(err); document.getElementById('loading-container').innerHTML = '<p class="text-red-500">Erro ao carregar: ' + err.message + '</p>'; });

    carregarListaFuncionarios();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEscalas);
} else {
    initEscalas();
}
})();
