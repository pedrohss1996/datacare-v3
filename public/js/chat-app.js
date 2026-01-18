/**
 * DataCare - Lógica Principal do Chat e Agenda
 * Versão: Final (Fusão: Código Antigo + Correções Tasy e Realtime + Novos Modais)
 */

const socket = io(); 
let activeTicketId = null;

// Variáveis vindas do objeto global (definido no HTML)
const meuIdAtual = window.DATA_CARE ? window.DATA_CARE.userId : null; 
const meuNomeAtual = window.DATA_CARE ? window.DATA_CARE.userName : 'Atendente';

// Variável global para o Timer de busca (Autocomplete)
let timerBuscaPaciente = null;

// ==========================================
// 🛠️ FUNÇÕES UTILITÁRIAS (HELPERS)
// ==========================================

function formatarDataHora(dataString) {
    if (!dataString) return '';
    const data = new Date(dataString);
    const hoje = new Date();

    const isHoje = data.getDate() === hoje.getDate() &&
                   data.getMonth() === hoje.getMonth() &&
                   data.getFullYear() === hoje.getFullYear();

    const opcoesHora = { hour: '2-digit', minute: '2-digit' };
    
    if (isHoje) {
        return data.toLocaleTimeString('pt-BR', opcoesHora);
    }
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + 
           data.toLocaleTimeString('pt-BR', opcoesHora);
}

function rolarParaBaixo() {
    const areaMsg = document.getElementById('chat-messages');
    if (areaMsg) {
        setTimeout(() => {
            areaMsg.scrollTop = areaMsg.scrollHeight;
        }, 50);
    }
}

// ==========================================
// 🎨 RENDERIZAÇÃO DE MENSAGENS
// ==========================================
function renderizarMensagemNaTela(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    // Evita limpar o chat se o usuário digitar "Carregando"
    if (container.innerText.includes('Carregando') || container.innerText.includes('Inicie')) {
        container.innerHTML = '';
    }

    const isMe = msg.remetente === 'ATENDENTE';
    const rawConteudo = msg.conteudo || msg.texto; 
    const horaFormatada = formatarDataHora(msg.criado_em || new Date());

    const alignClass = isMe ? 'justify-end' : 'justify-start';
    const bgClass = isMe ? 'bg-blue-600 text-white' : 'bg-white text-slate-800 border border-slate-200';
    const borderClass = isMe ? 'rounded-tr-none' : 'rounded-tl-none';
    const checkColor = isMe ? 'text-blue-200' : 'text-blue-500';

    let conteudoHtml = '';
    
    if (msg.tipo === 'imagem' || (msg.mimetype && msg.mimetype.startsWith('image/'))) {
        conteudoHtml = `<a href="${rawConteudo}" target="_blank"><img src="${rawConteudo}" class="img-fluid rounded mt-1 bg-white p-1" style="max-width: 250px;"></a>`;
    } else if (msg.tipo === 'audio' || (msg.mimetype && msg.mimetype.startsWith('audio/'))) {
        const audioBg = isMe ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500';
        conteudoHtml = `<div class="mt-1 flex items-center gap-2"><div class="${audioBg} rounded-full p-2"><i class="fa-solid fa-microphone"></i></div><audio controls style="max-width: 220px; height: 32px;"><source src="${rawConteudo}" type="audio/ogg"></audio></div>`;
    } else if (msg.tipo === 'arquivo' || msg.tipo === 'document' || msg.tipo === 'application') {
        const fileBg = isMe ? 'bg-white/20 border-white/20' : 'bg-slate-50 border-slate-200';
        conteudoHtml = `<a href="${rawConteudo}" target="_blank" class="flex items-center gap-2 ${fileBg} p-2 rounded border transition mt-1"><i class="fa-solid fa-file-pdf text-red-500"></i><span class="text-xs font-bold underline">Baixar Arquivo</span></a>`;
    } else {
        conteudoHtml = `<p class="text-sm whitespace-pre-wrap leading-relaxed">${rawConteudo}</p>`;
    }

    const htmlMsg = `
        <div class="flex ${alignClass} mb-3 animate-in fade-in slide-in-from-bottom-1 duration-300">
            <div class="max-w-[75%] ${bgClass} rounded-2xl ${borderClass} px-4 py-2 shadow-sm relative group">
                ${conteudoHtml}
                <div class="flex items-center justify-end gap-1 mt-1 opacity-80">
                    <span class="text-[10px] font-medium ${isMe ? 'text-blue-100' : 'text-slate-400'}">${horaFormatada}</span>
                    ${isMe ? `<i class="fa-solid fa-check-double text-[10px] ${checkColor}"></i>` : ''}
                </div>
            </div>
        </div>`;
        
    container.insertAdjacentHTML('beforeend', htmlMsg);
    rolarParaBaixo();
}

// ==========================================
// 🔌 SOCKET & API DO CHAT
// ==========================================

async function abrirChat(ticketId) {
    activeTicketId = ticketId;
    
    document.getElementById('chat-empty').classList.add('hidden');
    ['chat-header', 'chat-messages', 'chat-input'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.remove('hidden');
    });
    
    const areaMsg = document.getElementById('chat-messages');
    areaMsg.innerHTML = '<div class="text-center text-xs text-slate-400 mt-10"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</div>';

    // 🔴 FORÇA O JOIN NA SALA (Correção Realtime)
    socket.emit('join_ticket', ticketId);

    const card = document.querySelector(`.ticket-card[data-id="${ticketId}"]`);
    if(card) {
        const nome = card.querySelector('h3').innerText;
        document.getElementById('chat-nome').innerText = nome;
        document.getElementById('chat-avatar').innerText = nome.charAt(0);
        const idDisplay = document.getElementById('ticket-id-val');
        if (idDisplay) idDisplay.innerText = ticketId;
    }

    try {
        const res = await fetch(`/api/chat/mensagens/${ticketId}`);
        const mensagens = await res.json();
        
        areaMsg.innerHTML = mensagens.length ? '' : '<div class="text-center text-xs text-slate-400 mt-10">Inicie a conversa...</div>';
        mensagens.forEach(m => renderizarMensagemNaTela(m));
        rolarParaBaixo();
    } catch (e) {
        console.error(e);
        areaMsg.innerHTML = '<div class="text-center text-xs text-red-400 mt-10">Erro ao carregar histórico.</div>';
    }
}

function copiarTicketId() {
    if(!activeTicketId) return;
    navigator.clipboard.writeText(activeTicketId).then(() => {
        Swal.fire({ toast: true, position: 'top', icon: 'success', title: `ID #${activeTicketId} copiado!`, showConfirmButton: false, timer: 2000 });
    });
}

async function enviarMensagem() {
    const input = document.getElementById('input-msg');
    const conteudo = input.value.trim();
    if (!conteudo || !activeTicketId) return;
    
    input.value = ''; 
    input.focus();

    renderizarMensagemNaTela({
        remetente: 'ATENDENTE',
        tipo: 'texto',
        conteudo: conteudo,
        criado_em: new Date()
    });

    const cardLateral = document.querySelector(`.ticket-card[data-id="${activeTicketId}"]`);
    if (cardLateral) {
        const lastMsgEl = cardLateral.querySelector('.last-msg');
        if (lastMsgEl) {
            lastMsgEl.innerText = `Você: ${conteudo}`;
            lastMsgEl.classList.add('font-bold', 'text-slate-800');
        }
        const listaMeus = document.getElementById('lista-meus');
        if(listaMeus) listaMeus.prepend(cardLateral);
    }

    try {
        await fetch('/api/chat/enviar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId: activeTicketId, conteudo: conteudo })
        });
    } catch (e) { console.error(e); }
}

async function enviarArquivo(input) {
    if (!input.files || !input.files[0] || !activeTicketId) return;

    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('ticketId', activeTicketId);

    Swal.fire({
        title: 'Enviando...',
        text: 'Fazendo upload do arquivo',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
    });

    try {
        const res = await fetch('/api/chat/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        Swal.close();

        if (data.success) {
            if(data.mensagem) renderizarMensagemNaTela(data.mensagem);
        } else {
            Swal.fire('Erro', 'Falha no upload', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Erro', 'Erro de rede no upload', 'error');
    } finally {
        input.value = ''; 
    }
}

async function finalizarAtendimento() {
    if (!activeTicketId) return;

    const result = await Swal.fire({
        title: 'Finalizar Atendimento?',
        text: "O ticket será encerrado e arquivado.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sim, finalizar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            const res = await fetch('/api/chat/finalizar', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ ticketId: activeTicketId })
            });
            
            if (res.ok) {
                document.getElementById('chat-empty').classList.remove('hidden');
                ['chat-header', 'chat-messages', 'chat-input'].forEach(id => {
                    const el = document.getElementById(id);
                    if(el) el.classList.add('hidden');
                });
                
                const card = document.querySelector(`.ticket-card[data-id="${activeTicketId}"]`);
                if(card) card.remove();
                
                activeTicketId = null;

                atualizarContadoresUI();

                Swal.fire('Finalizado!', 'Atendimento encerrado.', 'success');
            }
        } catch (e) {
            Swal.fire('Erro', 'Não foi possível finalizar.', 'error');
        }
    }
}

// ↔️ Transferência de Chat
async function abrirModalTransferencia() {
    if (!activeTicketId) return;
    const modal = document.getElementById('modal-transferencia');
    const select = document.getElementById('transfer-atendente-id');
    
    if(modal) modal.classList.remove('hidden');
    if(select) {
        select.innerHTML = '<option>Carregando...</option>';
        try {
            const res = await fetch('/api/usuarios/ativos'); 
            const users = await res.json();
            
            select.innerHTML = '<option value="" disabled selected>Selecione um colega...</option>';
            users.forEach(u => {
                if(u.id != meuIdAtual) { 
                    select.innerHTML += `<option value="${u.id}">🟢 ${u.nome}</option>`;
                }
            });
        } catch (e) {
            select.innerHTML = '<option>Erro ao carregar lista</option>';
        }
    }
}

function fecharModalTransferencia() {
    const modal = document.getElementById('modal-transferencia');
    if(modal) modal.classList.add('hidden');
}

async function confirmarTransferencia() {
    const novoAtendenteId = document.getElementById('transfer-atendente-id').value;
    const motivo = document.getElementById('transfer-obs').value;
    
    if(!novoAtendenteId) return Swal.fire('Ops', 'Selecione um atendente', 'warning');

    try {
        await fetch('/api/chat/transferir', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ticketId: activeTicketId, novoAtendenteId, motivo })
        });
        
        fecharModalTransferencia();
        document.getElementById('chat-empty').classList.remove('hidden');
        ['chat-header', 'chat-messages', 'chat-input'].forEach(id => document.getElementById(id).classList.add('hidden'));
        
        const card = document.querySelector(`.ticket-card[data-id="${activeTicketId}"]`);
        if(card) card.remove();
        
        activeTicketId = null;
        Swal.fire('Transferido', 'O atendimento foi transferido.', 'success');
    } catch (e) {
        Swal.fire('Erro', 'Falha ao transferir', 'error');
    }
}

async function assumirTicket(ticketId) {
    try {
        await fetch('/api/chat/assumir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId })
        });
    } catch (e) { 
        console.error(e);
        Swal.fire('Erro', 'Não foi possível assumir este ticket.', 'error');
    }
}

function adicionarTicketAFila(ticket) {
    const containerFila = document.getElementById('lista-fila');
    if (containerFila && containerFila.innerText.toLowerCase().includes('vazia')) containerFila.innerHTML = '';
    
    const nome = ticket.nome_contato || 'Paciente';
    const iniciais = nome.charAt(0).toUpperCase();

    const cardHtml = `
        <div class="ticket-card relative p-4 border-b border-slate-100 hover:bg-white transition group bg-white mx-2 my-2 rounded-lg shadow-sm border animate-in slide-in-from-left duration-300" data-id="${ticket.id}">
            <div class="flex justify-between items-start">
                <div class="flex gap-3">
                    <div class="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-xs shrink-0">${iniciais}</div>
                    <div>
                        <h3 class="font-bold text-slate-700 text-sm">${nome}</h3>
                        <span class="inline-block mt-0.5 px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold bg-amber-50 text-amber-600 uppercase tracking-wide border border-amber-100">Aguardando</span>
                    </div>
                </div>
                <button onclick="assumirTicket(${ticket.id})" class="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-600 hover:text-white transition shadow-sm active:scale-95"><i class="fa-solid fa-check text-xs"></i></button>
            </div>
            <div class="mt-3 flex items-center gap-1.5 pl-1">
                <i class="fa-brands fa-whatsapp text-slate-300 text-xs"></i>
                <span class="text-[11px] text-slate-400 font-medium">${ticket.numero_whatsapp}</span>
            </div>
            <p class="text-[10px] text-slate-400 mt-2 pl-1 truncate border-l-2 border-slate-200 pl-2 italic">"${ticket.ultima_mensagem || 'Nova mensagem...'}"</p>
        </div>`;

    if (containerFila) {
        containerFila.insertAdjacentHTML('afterbegin', cardHtml);
        atualizarContadoresUI();
    }
    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Novo Paciente na Fila', showConfirmButton: false, timer: 3000 });
}

function atualizarContadoresUI() {
    // --- Lógica da Fila ---
    const qtdFila = document.querySelectorAll('#lista-fila .ticket-card').length;
    const badgeFila = document.getElementById('count-fila'); 
    if (badgeFila) {
        badgeFila.innerText = qtdFila;
        
        if (qtdFila === 0) {
            badgeFila.classList.add('hidden');
        } else {
            badgeFila.classList.remove('hidden');
        }
    }

    // --- Lógica dos Meus Tickets ---
    const qtdMeus = document.querySelectorAll('#lista-meus .ticket-card').length;
    const badgeMeus = document.getElementById('count-meus');
    
    if (badgeMeus) {
        badgeMeus.innerText = qtdMeus;
        
        if (qtdMeus === 0) {
            badgeMeus.classList.add('hidden');
        } else {
            badgeMeus.classList.remove('hidden');
        }
    }
}

// ==========================================
// 📅 INTEGRAÇÃO TASY (AGENDA) - ATUALIZADO
// ==========================================

async function verificarFluxoAgenda() {
    const select = document.getElementById('tasy-unidade');
    const tipoId = select.value;
    
    if(!tipoId) return;

    const tipoTexto = select.options[select.selectedIndex].text.toUpperCase();
    const ehExame = tipoId == '2' || tipoTexto.includes('EXAME') || tipoTexto.includes('SADT');
    
    // UI Elements
    const divEsp = document.getElementById('container-especialidade');
    const divConv = document.getElementById('container-convenio');
    const labelRecurso = document.getElementById('label-recurso');

    if (ehExame) {
        divEsp.classList.add('hidden');
        divConv.classList.add('hidden');
        labelRecurso.innerText = "2. Exame / Sala";
        document.getElementById('tasy-especialidade').value = "";
        document.getElementById('tasy-convenio').value = "";
    } else {
        divEsp.classList.remove('hidden');
        divConv.classList.remove('hidden');
        labelRecurso.innerText = "4. Profissional";
        carregarEspecialidades(tipoId);
        carregarListaConvenios(); 
    }

    await carregarRecursos();
}

async function carregarRecursos() {
    const tipo = document.getElementById('tasy-unidade').value;
    const espEl = document.getElementById('tasy-especialidade');
    const convEl = document.getElementById('tasy-convenio');
    
    const esp = (espEl && !espEl.parentElement.classList.contains('hidden')) ? espEl.value : "";
    const conv = (convEl && !convEl.parentElement.classList.contains('hidden')) ? convEl.value : "";
    
    const target = document.getElementById('tasy-recurso');

    if(!tipo) return; 

    target.innerHTML = '<option value="">⏳ Buscando...</option>';
    target.disabled = true;

    let url = `/api/tasy/recursos?tipo=${tipo}`;
    if(esp) url += `&especialidade=${esp}`;
    if(conv) url += `&convenio=${conv}`;

    try {
        const res = await fetch(url);
        const dados = await res.json();
        
        if(dados.length > 0) {
            target.innerHTML = '<option value="">Selecione...</option>' + 
                dados.map(d => `<option value="${d.CD_AGENDA}">${d.DS_AGENDA}</option>`).join('');
            target.disabled = false;
        } else {
            target.innerHTML = '<option value="">Nenhum recurso encontrado</option>';
            target.disabled = false;
        }
    } catch (e) {
        console.error("Erro recursos:", e);
        target.innerHTML = '<option value="">Erro na busca</option>';
        target.disabled = false;
    }
}

async function carregarConvenios() {
    await carregarRecursos(); 
    await carregarListaConvenios();
}

async function carregarListaConvenios() {
    const target = document.getElementById('tasy-convenio');
    if(!target || target.options.length > 1) return;

    try {
        const res = await fetch(`/api/tasy/convenios`);
        const dados = await res.json();
        target.innerHTML = '<option value="">Todos os Convênios</option>' + 
            dados.map(d => `<option value="${d.CD_CONVENIO}">${d.DS_CONVENIO}</option>`).join('');
        target.disabled = false;
    } catch (e) { console.error('Erro Convênios', e); }
}

async function carregarEspecialidades(tipoId) {
    const target = document.getElementById('tasy-especialidade');
    if(target.options.length > 1) return;

    try {
        const res = await fetch(`/api/tasy/especialidades/${tipoId}`);
        const dados = await res.json();
        target.innerHTML = '<option value="">Todas as Especialidades</option>' + 
            dados.map(d => `<option value="${d.CD_ESPECIALIDADE}">${d.DS_ESPECIALIDADE}</option>`).join('');
        target.disabled = false;
    } catch (e) { console.error('Erro Especialidades', e); }
}

async function carregarUnidades() {
    const select = document.getElementById('tasy-unidade');
    try {
        const res = await fetch('/api/tasy/unidades');
        const dados = await res.json();
        select.innerHTML = '<option value="">Selecione...</option>' + dados.map(d => `<option value="${d.CD_TIPO}">${d.DS_TIPO}</option>`).join('');
    } catch (e) { select.innerHTML = '<option>Erro ao carregar</option>'; }
}

async function buscarAgenda() {
    const recurso = document.getElementById('tasy-recurso').value;
    const data = document.getElementById('tasy-data').value;
    const container = document.getElementById('lista-agenda');
    
    if(!recurso || !data) return Swal.fire('Filtros', 'Selecione pelo menos o Profissional e a Data', 'info');

    container.innerHTML = '<div class="p-8 text-center text-xs text-slate-500"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    
    try {
        const res = await fetch('/api/tasy/agenda', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ recurso, data })
        });
        const agenda = await res.json();
        container.innerHTML = agenda.length ? '' : '<div class="p-8 text-center text-xs text-slate-400">Nenhum horário disponível.</div>';
        
        agenda.forEach(slot => {
            const statusClass = slot.IE_STATUS === 'L' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700';
            container.innerHTML += `
                <div class="flex items-center px-4 py-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 group transition" oncontextmenu="abrirMenuContexto(event, ${slot.ID})">
                    <div class="w-14 font-bold text-slate-600 text-xs">${slot.HORA}</div>
                    <div class="flex-1 flex items-center gap-2 min-w-0">
                        <span class="truncate font-bold text-slate-800 text-xs">${slot.PACIENTE || 'Livre'}</span>
                        ${slot.CONVENIO ? `<span class="shrink-0 text-[10px] text-slate-400 font-medium">(${slot.CONVENIO})</span>` : ''}
                    </div>
                    <span class="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${statusClass}">${slot.STATUS_DESC || slot.IE_STATUS}</span>
                </div>`;
        });
    } catch (e) { container.innerHTML = 'Erro na consulta do Tasy.'; }
}

function resetSelect(id, texto) {
    const el = document.getElementById(id);
    if(el) {
        el.innerHTML = `<option value="">${texto}</option>`;
        el.disabled = true;
    }
}

// ==========================================
// ℹ️ ORIENTAÇÕES MÉDICAS (TASY)
// ==========================================

async function verOrientacao() {
    const agendaId = document.getElementById('tasy-recurso').value;
    const tipo = document.getElementById('tasy-unidade').value;

    if (!agendaId) {
        return;
    }

    const modal = document.getElementById('modal-orientacao');
    const content = document.getElementById('conteudo-orientacao');
    
    if(modal) modal.classList.remove('hidden');
    if(content) content.innerHTML = '<div class="flex flex-col items-center justify-center py-10 text-slate-400"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><span>Buscando no Tasy...</span></div>';

    try {
        const res = await fetch(`/api/tasy/orientacao?agendaId=${agendaId}&tipo=${tipo}`);
        const data = await res.json();

        if (content) {
            if (data.orientacao) {
                content.innerHTML = data.orientacao;
            } else {
                content.innerHTML = `
                    <div class="text-center py-8 text-slate-400">
                        <i class="fa-regular fa-file-lines text-4xl mb-3 opacity-30"></i>
                        <p>Nenhuma orientação cadastrada.</p>
                    </div>`;
            }
        }
    } catch (e) {
        console.error(e);
        if(content) content.innerHTML = '<div class="text-center text-red-500 py-4">Erro ao carregar orientações.</div>';
    }
}

function fecharModalOrientacao() {
    const modal = document.getElementById('modal-orientacao');
    if(modal) modal.classList.add('hidden');
}

const modalOverlay = document.getElementById('modal-orientacao');
if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
        if (e.target.id === 'modal-orientacao') fecharModalOrientacao();
    });
}

// ==========================================
// 🕹️ MENU DE CONTEXTO E MODAIS (AÇÕES)
// ==========================================
let agendaIdSelecionado = null;

function abrirMenuContexto(e, idAgenda) {
    e.preventDefault(); 
    agendaIdSelecionado = idAgenda;
    const menu = document.getElementById('context-menu');

    // 1. IMPORTANTE: Removemos o hidden PRIMEIRO para o navegador calcular a altura real
    menu.classList.remove('hidden');

    // 2. Pegamos as medidas
    const menuHeight = menu.offsetHeight;
    const menuWidth = menu.offsetWidth;
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;

    // 3. Lógica Vertical (Evita cortar embaixo)
    // Se a posição do mouse + altura do menu ultrapassar o fim da tela...
    if (e.clientY + menuHeight > windowHeight) {
        // ...posiciona o menu PARA CIMA do mouse
        menu.style.top = `${e.clientY - menuHeight}px`;
    } else {
        // ...senão, posiciona PARA BAIXO (padrão)
        menu.style.top = `${e.clientY}px`;
    }

    // 4. Lógica Horizontal (Evita cortar na direita - Bônus)
    // Se a posição do mouse + largura do menu ultrapassar a largura da tela...
    if (e.clientX + menuWidth > windowWidth) {
        // ...joga o menu para a ESQUERDA do mouse
        menu.style.left = `${e.clientX - menuWidth}px`;
    } else {
        // ...senão, posiciona na direita (padrão)
        menu.style.left = `${e.clientX}px`;
    }
}

document.addEventListener('click', () => {
    const menu = document.getElementById('context-menu');
    if(menu) menu.classList.add('hidden');
});

async function acaoAgenda(acao) {
    document.getElementById('context-menu').classList.add('hidden');
    if (acao === 'agendar') return abrirModalAgendamento();

    const configs = {
        confirmar: { titulo: 'Confirmar Agendamento?', cor: '#16a34a', endpoint: '/api/tasy/confirmar' },
        cancelar: { titulo: 'Cancelar Agendamento?', cor: '#dc2626', endpoint: '/api/tasy/cancelar' },
        bloquear: { titulo: 'Bloquear Horário?', cor: '#ea580c', endpoint: '/api/tasy/bloquear' },
        encaixe: { titulo: 'Gerar Encaixe?', cor: '#9333ea', endpoint: '/api/tasy/encaixe' 
        }
    };

    const config = configs[acao];
    const result = await Swal.fire({
        title: config.titulo,
        text: "Deseja realizar essa ação?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: config.cor,
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, processar',
        reverseButtons: true
    });

    if (result.isConfirmed) {
        const toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        toast.fire({ icon: 'info', title: 'Processando' });
        
        fetch(config.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agendaId: agendaIdSelecionado })
        }).then(res => res.json()).then(data => {
            if (data.success) {
                toast.fire({ icon: 'success', title: 'Atualizado!' });
                buscarAgenda(); 
            }
        });
    }
}

// ==========================================
// 1. LÓGICA DO MODAL DE AGENDAMENTO (NOVO)
// ==========================================

// Função chamada pelo botão "Agendar" no Menu de Contexto
function abrirModalAgendamento() {
    // Pega o ID da agenda selecionada (variável global que definimos no menu de contexto)
    if (!agendaIdSelecionado) return;

    // Tenta encontrar o elemento visual do slot para pegar a Hora e Nome (se tiver)
    const slotEl = document.querySelector(`div[oncontextmenu*="${agendaIdSelecionado}"]`);
    let horaSelecionada = '';
    let pacienteAtual = '';

    if (slotEl) {
        // Tenta pegar a hora da div .w-14 (primeira coluna do slot)
        const horaDiv = slotEl.querySelector('.w-14');
        if(horaDiv) horaSelecionada = horaDiv.innerText.trim();
        
        // Verifica se já tem paciente (caso seja edição)
        const pacienteDiv = slotEl.querySelector('.flex-1 span');
        if(pacienteDiv && pacienteDiv.innerText !== 'Livre') {
            pacienteAtual = pacienteDiv.innerText;
        }
    }

    // 1. Popula campos Hidden e Visuais
    document.getElementById('agenda-id-hidden').value = agendaIdSelecionado;
    
    // Define Data e Hora nos inputs novos
    const dataSelecionada = document.getElementById('tasy-data').value;
    document.getElementById('ag-data').value = dataSelecionada;
    document.getElementById('ag-hora').value = horaSelecionada;

    // Define o Tipo (Baseado no Select principal da tela)
    const tipoUnidade = document.getElementById('tasy-unidade').value;
    document.getElementById('select-tipo-agenda').value = tipoUnidade == '2' ? '2' : '1'; 
    document.getElementById('agenda-tipo-hidden').value = tipoUnidade == '2' ? '2' : '1';

    // 2. Reset de Tela
    document.getElementById('input-busca-paciente').value = '';
    document.getElementById('lista-resultados-paciente').innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Digite acima para buscar...</div>';
    document.getElementById('txt-obs-agenda').value = '';
    document.getElementById('select-convenio-agenda').value = ''; // Reset convênio

    // Se já tinha paciente no slot (Edição), preenche o display
    if(pacienteAtual) {
        document.getElementById('ag-paciente-display').value = pacienteAtual;
    } else {
        limparSelecaoPaciente();
    }

    document.getElementById('modal-agendamento').classList.remove('hidden');
    
    // Foco na busca
    setTimeout(() => document.getElementById('input-busca-paciente').focus(), 100);
}

function fecharModalAgendamento() {
    document.getElementById('modal-agendamento').classList.add('hidden');
}

// Busca de Pacientes com Debounce
function buscarPacientes(termo) {
    clearTimeout(timerBuscaPaciente);
    const lista = document.getElementById('lista-resultados-paciente');
    
    if (termo.length < 3) return;

    timerBuscaPaciente = setTimeout(async () => {
        try {
            lista.innerHTML = '<div class="p-4 text-center text-xs text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Buscando no Tasy...</div>';

            const res = await fetch(`/api/tasy/pacientes/buscar?termo=${encodeURIComponent(termo)}`);
            const dados = await res.json();

            if (dados.length === 0) {
                lista.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Nenhum paciente encontrado.</div>';
            } else {
                // Renderiza linhas estilo tabela
                lista.innerHTML = dados.map(p => `
                    <div onclick="selecionarPacienteBusca(${p.CD_PESSOA_FISICA}, '${p.NM_PESSOA_FISICA}', '${p.NR_CPF || ''}', '${p.NR_TELEFONE_CELULAR || ''}')" 
                         class="grid grid-cols-12 gap-2 px-4 py-2 border-b border-slate-50 hover:bg-blue-50 cursor-pointer text-xs items-center transition group">
                        <div class="col-span-6 font-bold text-slate-700 group-hover:text-blue-700">${p.NM_PESSOA_FISICA}</div>
                        <div class="col-span-3 text-slate-500">${p.NR_CPF || '-'}</div>
                        <div class="col-span-3 text-slate-500">${p.DT_NASCIMENTO ? new Date(p.DT_NASCIMENTO).toLocaleDateString('pt-BR') : '-'}</div>
                    </div>
                `).join('');
            }
        } catch (e) {
            console.error(e);
            lista.innerHTML = '<div class="p-4 text-center text-xs text-red-400">Erro na busca.</div>';
        }
    }, 500);
}

// Seleciona paciente da lista e preenche a UI
function selecionarPacienteBusca(id, nome, cpf, tel) {
    // Guarda o ID
    document.getElementById('paciente-id-selecionado').value = id;
    
    // Atualiza o Input Visual
    const display = document.getElementById('ag-paciente-display');
    display.value = nome;
    display.classList.remove('bg-blue-50', 'text-blue-800');
    display.classList.add('bg-green-50', 'text-green-800', 'border-green-200');
    
    // Limpa a busca
    document.getElementById('input-busca-paciente').value = '';
    document.getElementById('lista-resultados-paciente').innerHTML = '<div class="p-4 text-center text-xs text-green-600"><i class="fa-solid fa-check mr-1"></i>Paciente selecionado!</div>';
}

function limparSelecaoPaciente() {
    document.getElementById('paciente-id-selecionado').value = '';
    const display = document.getElementById('ag-paciente-display');
    display.value = '';
    display.classList.remove('bg-green-50', 'text-green-800', 'border-green-200');
    display.classList.add('bg-blue-50', 'text-blue-800', 'border-blue-200');
}

// ==========================================
// 2. LÓGICA DO MODAL DE CADASTRO
// ==========================================

function abrirModalCadastro() {
    // Se quiser editar alguém já selecionado
    const idAtual = document.getElementById('paciente-id-selecionado').value;
    
    document.getElementById('form-cadastro-paciente').reset();
    document.getElementById('cad-id').value = '';
    
    if(idAtual) {
        carregarDadosEdicao(idAtual);
    }
    
    document.getElementById('modal-cadastro-paciente').classList.remove('hidden');
}

async function carregarDadosEdicao(id) {
    try {
        const res = await fetch(`/api/tasy/pacientes/${id}`);
        const data = await res.json();
        
        // Preencher campos essenciais
        document.getElementById('cad-id').value = data.CD_PESSOA_FISICA;
        document.getElementById('cad-nome').value = data.NM_PESSOA_FISICA;
        document.getElementById('cad-cpf').value = data.NR_CPF;
        document.getElementById('cad-tel').value = data.NR_TELEFONE_CELULAR;
        // Preencher outros campos se necessário...
    } catch(e) { console.error('Erro ao carregar paciente', e); }
}

function fecharModalCadastro() {
    document.getElementById('modal-cadastro-paciente').classList.add('hidden');
}

async function salvarCadastroPaciente() {
    const form = document.getElementById('form-cadastro-paciente');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries()); 
    
    if(!data.nome || !data.cpf) return Swal.fire('Erro', 'Preencha Nome e CPF', 'warning');

    try {
        Swal.showLoading();
        const res = await fetch('/api/tasy/pacientes/salvar', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        
        const result = await res.json();
        
        if (result.success) {
            Swal.fire({icon: 'success', title: 'Salvo!', timer: 1500, showConfirmButton: false});
            
            // Fluxo Inteligente: Já seleciona o paciente no modal de agendamento
            selecionarPacienteBusca(
                data.cd_pessoa_fisica || 0, // Se a procedure retornar ID, ideal usar ele.
                data.nome, 
                data.cpf, 
                data.telefone
            );
            
            fecharModalCadastro();
        } else {
            Swal.fire('Erro', result.error || 'Falha ao salvar', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Erro', 'Erro de comunicação', 'error');
    }
}

// ==========================================
// 3. FINALIZAR AGENDAMENTO (CONFIRMAR)
// ==========================================

async function confirmarAgendamento() {
    const pacienteId = document.getElementById('paciente-id-selecionado').value;
    
    if (!pacienteId) return Swal.fire('Atenção', 'Selecione um paciente primeiro.', 'warning');

    const payload = {
        agendaId: document.getElementById('agenda-id-hidden').value,
        cd_tipo: document.getElementById('agenda-tipo-hidden').value,
        pacienteId: pacienteId,
        pacienteNome: document.getElementById('ag-paciente-display').value,
        convenio: document.getElementById('select-convenio-agenda').value,
        obs: document.getElementById('txt-obs-agenda').value,
        // Dados extras
        telefone: '', // Se tiver o campo no modal, pegue aqui
    };

    try {
        const btn = document.querySelector('button[onclick="confirmarAgendamento()"]');
        if(btn) btn.disabled = true;

        const res = await fetch('/api/tasy/agendar/confirmar', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();
        if (result.success) {
            Swal.fire('Sucesso', 'Agendamento Confirmado!', 'success');
            fecharModalAgendamento();
            buscarAgenda(); // Recarrega a lista de horários
        } else {
            Swal.fire('Erro Tasy', result.error, 'error');
        }
    } catch (e) {
        Swal.fire('Erro', 'Falha na requisição', 'error');
    } finally {
        const btn = document.querySelector('button[onclick="confirmarAgendamento()"]');
        if(btn) btn.disabled = false;
    }
}


// ==========================================
// 🚀 INICIALIZAÇÃO E EVENT LISTENERS
// ==========================================

const atalhosSistema = {
    '#ola': `Olá! Sou o atendente ${meuNomeAtual}. Como posso ajudar você hoje?`,
    '#marlon': 'Olá, aqui é o Marlon! Em que posso ser útil?',
    '#endereco': '🏥 Estamos na Av. T-63, nº 1290 - Setor Bueno.',
    '#pix': '💲 Chave PIX: 00.123.456/0001-99',
    '#tarde': 'Boa tarde! Tudo bem com você?',
    '#exame': 'Por favor, envie a foto do pedido médico e da carteirinha.'
};

function abrirModalAtivo() { document.getElementById('modal-ativo').classList.remove('hidden'); document.getElementById('ativo-telefone').focus(); }
function fecharModalAtivo() { document.getElementById('modal-ativo').classList.add('hidden'); document.getElementById('ativo-telefone').value = ''; document.getElementById('ativo-nome').value = ''; document.getElementById('ativo-msg').value = ''; }

async function confirmarContatoAtivo() {
    const telefone = document.getElementById('ativo-telefone').value.replace(/\D/g, ''); 
    const nome = document.getElementById('ativo-nome').value;
    const msg = document.getElementById('ativo-msg').value;
    const btn = document.getElementById('btn-enviar-ativo');

    if (telefone.length < 10) return Swal.fire('Erro', 'Telefone inválido.', 'warning');
    if (!msg) return Swal.fire('Erro', 'Digite uma mensagem.', 'warning');

    btn.disabled = true;
    btn.innerHTML = 'Enviando...';

    try {
        const res = await fetch('/api/chat/iniciar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telefone, nome, mensagem: msg }) });
        const data = await res.json();
        if (data.success) {
            fecharModalAtivo();
            Swal.fire({ toast: true, icon: 'success', title: 'Mensagem enviada!', position: 'top-end', showConfirmButton: false, timer: 2000 });
        } else { throw new Error(data.error); }
    } catch (error) { Swal.fire('Erro', error.message, 'error'); }
    finally { btn.disabled = false; btn.innerHTML = 'Enviar'; }
}

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa Filtros Agenda
    const inputData = document.getElementById('tasy-data');
    if(inputData) inputData.valueAsDate = new Date();
    carregarUnidades();

    socket.on('connect', () => console.log('🟢 DataCare Socket Conectado:', socket.id));

    // Monitoramento de Atalhos
    const inputMsg = document.getElementById('input-msg');
    if (inputMsg) {
        inputMsg.addEventListener('keyup', (e) => {
            const texto = inputMsg.value;
            const cursorPosition = inputMsg.selectionStart;
            if (e.key === ' ' || e.code === 'Space') {
                const textoAteCursor = texto.substring(0, cursorPosition);
                const palavras = textoAteCursor.trimEnd().split(' ');
                const ultimaPalavra = palavras[palavras.length - 1].toLowerCase();
                if (atalhosSistema[ultimaPalavra]) {
                    const expansao = atalhosSistema[ultimaPalavra];
                    const inicioTexto = textoAteCursor.substring(0, textoAteCursor.lastIndexOf(ultimaPalavra));
                    const restoTexto = texto.substring(cursorPosition);
                    const novoTexto = inicioTexto + expansao + ' ' + restoTexto;
                    inputMsg.value = novoTexto;
                    const novaPosicaoCursor = (inicioTexto + expansao + ' ').length;
                    inputMsg.setSelectionRange(novaPosicaoCursor, novaPosicaoCursor);
                    inputMsg.classList.add('bg-blue-50');
                    setTimeout(() => inputMsg.classList.remove('bg-blue-50'), 200);
                }
            }
        });
        
        inputMsg.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                enviarMensagem();
            }
        });
    }

    // Ouvintes Socket
    socket.on('nova_mensagem', (data) => {
        if (!activeTicketId || data.ticket_id != activeTicketId) return;
        if (data.remetente === 'ATENDENTE') return;
        renderizarMensagemNaTela(data);
    });

    socket.on('novo_ticket_fila', (ticket) => adicionarTicketAFila(ticket));
    
    socket.on('ticket_assumido_fila', (data) => {
        const cardOriginal = document.querySelector(`.ticket-card[data-id="${data.ticketId}"]`);
        if (data.atendenteId == meuIdAtual) {
            const listaMeus = document.getElementById('lista-meus');
            const emptyMeus = document.getElementById('empty-meus');
            if (emptyMeus) emptyMeus.remove();

            let nome = data.nomePaciente || 'Paciente';
            if (cardOriginal) nome = cardOriginal.querySelector('h3').innerText;
            const iniciais = nome.charAt(0).toUpperCase();

            const novoCardHtml = `
                <div onclick="abrirChat(${data.ticketId})" class="ticket-card relative p-4 border-b border-slate-50 hover:bg-slate-50 transition cursor-pointer group flex gap-3 animate-in fade-in slide-in-from-left duration-300" data-id="${data.ticketId}">
                    <div class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100">${iniciais}</div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start mb-1">
                            <div>
                                <h3 class="font-bold text-slate-800 text-sm leading-none">${nome}</h3>
                                <span class="inline-block mt-1 px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold bg-blue-50 text-blue-600 uppercase tracking-wide border border-blue-100">Em Atendimento</span>
                            </div>
                            <div class="w-7 h-7 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center shadow-sm"><i class="fa-regular fa-paper-plane text-[10px]"></i></div>
                        </div>
                        <div class="flex items-center justify-between mt-2">
                            <div class="flex items-center gap-1.5 text-slate-400"><i class="fa-brands fa-whatsapp text-green-500 text-xs"></i><span class="text-[11px] font-medium">Online</span></div>
                        </div>
                        <p class="text-[10px] text-slate-400 mt-1 truncate last-msg font-medium text-slate-600">${data.ultima_mensagem || 'Iniciando conversa...'}</p>
                    </div>
                </div>`;
            if (cardOriginal) cardOriginal.remove();
            if (listaMeus) {
                const jaExiste = listaMeus.querySelector(`.ticket-card[data-id="${data.ticketId}"]`);
                if (!jaExiste) listaMeus.insertAdjacentHTML('afterbegin', novoCardHtml);
            }
        } else {
            if (cardOriginal) cardOriginal.remove();
        }
        atualizarContadoresUI();
    });

    socket.on('atualizar_lista_meus', (data) => {
        const card = document.querySelector(`#lista-meus .ticket-card[data-id="${data.ticketId}"]`);
        if (card) {
            const lastMsgEl = card.querySelector('.last-msg');
            if (lastMsgEl) {
                lastMsgEl.innerText = data.msg;
                lastMsgEl.classList.add('font-bold', 'text-slate-800');
            }
            const parent = card.parentNode;
            parent.prepend(card);
        }
    });

    // Auto-abrir orientações ao selecionar o médico
    const selectRecurso = document.getElementById('tasy-recurso');
    if(selectRecurso) {
        selectRecurso.addEventListener('change', function() {
            if(this.value) {
                verOrientacao();
            }
        });
    }
});