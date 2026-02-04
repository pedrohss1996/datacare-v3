/**
 * Smart - Abertura Zero Toque (Upload de Guia).
 * Lógica de cliente: drag & drop, upload, preenchimento do formulário de conferência.
 * Vanilla JS (EJS + Tailwind) conforme .cursorrules.
 */
(function () {
  'use strict';

  var dropZone = document.getElementById('dropZone');
  var fileInput = document.getElementById('fileInput');
  var dropZoneContent = document.getElementById('dropZoneContent');
  var uploadProgress = document.getElementById('uploadProgress');
  var progressBar = document.getElementById('progressBar');
  var progressText = document.getElementById('progressText');
  var uploadError = document.getElementById('uploadError');
  var formSection = document.getElementById('formSection');
  var formConferencia = document.getElementById('formConferencia');
  var reviewBadge = document.getElementById('reviewBadge');
  var listaProcedimentos = document.getElementById('listaProcedimentos');
  var formErros = document.getElementById('formErros');
  var btnNovaGuia = document.getElementById('btnNovaGuia');

  function showError(msg) {
    uploadError.textContent = msg || '';
    uploadError.classList.toggle('hidden', !msg);
  }

  function setProgress(percent, text) {
    if (progressBar) progressBar.style.width = (percent || 0) + '%';
    if (progressText) progressText.textContent = text || 'Processando...';
  }

  /**
   * Preenche o formulário com todos os dados retornados pelo backend (campos TISS).
   */
  function setVal(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val || '';
  }

  /** Mapeamento: número TISS, chave no JSON, rótulo do campo (todos os campos da tabela TISS). */
  var TISS_FIELDS = [
    { num: '-', key: 'tipo_guia', label: 'Tipo da guia' },
    { num: '-', key: 'versao_tiss', label: 'Versão TISS' },
    { num: '1', key: 'codigo_operadora', label: 'Registro ANS' },
    { num: '2', key: 'numero_guia_prestador', label: 'Nº Guia no Prestador' },
    { num: '3', key: 'numero_guia_principal', label: 'N° Guia Principal' },
    { num: '4', key: 'data_autorizacao', label: 'Data da Autorização' },
    { num: '5', key: 'senha', label: 'Senha' },
    { num: '6', key: 'data_validade_senha', label: 'Data Validade da Senha' },
    { num: '7', key: 'numero_guia_atribuido_operadora', label: 'N° Guia Atribuído pela Operadora' },
    { num: '8', key: 'numero_carteirinha', label: 'Número da Carteirinha' },
    { num: '9', key: 'data_validade', label: 'Validade da Carteira' },
    { num: '10', key: 'nome_paciente', label: 'Nome do beneficiário' },
    { num: '11', key: 'data_nascimento', label: 'Data de Nascimento / CNS' },
    { num: '12', key: 'atendimento_rn', label: 'Atendimento a RN' },
    { num: '13', key: 'codigo_operadora_solicitante', label: 'Código na Operadora (solicitante)' },
    { num: '14', key: 'nome_contratado', label: 'Nome do Contratado' },
    { num: '15', key: 'nome_profissional_solicitante', label: 'Nome do Profissional Solicitante' },
    { num: '16', key: 'conselho_profissional', label: 'Conselho Profissional' },
    { num: '17', key: 'numero_conselho', label: 'Número no Conselho' },
    { num: '18', key: 'uf_conselho', label: 'UF' },
    { num: '19', key: 'codigo_cbo', label: 'Código CBO' },
    { num: '21', key: 'carater_atendimento', label: 'Caráter do Atendimento' },
    { num: '22', key: 'data_solicitacao', label: 'Data da Solicitação' },
    { num: '23', key: 'indicacao_clinica', label: 'Indicação Clínica' },
    { num: '24-28', key: 'lista_procedimentos', label: 'Procedimentos (Tabela / Código TUSS / Descrição / Qtde / Valor)' },
    { num: '29', key: 'codigo_operadora_executante', label: 'Código na Operadora (executante)' },
    { num: '30', key: 'nome_contratado_executante', label: 'Nome do Contratado (executante)' },
    { num: '31', key: 'codigo_cnes', label: 'Código CNES' },
    { num: '32', key: 'tipo_atendimento', label: 'Tipo de Atendimento' },
    { num: '58', key: 'observacao_justificativa', label: 'Observação / Justificativa' },
    { num: '-', key: 'status_guia', label: 'Status da guia' },
    { num: '59', key: 'total_procedimentos', label: 'Total procedimentos (R$)' },
    { num: '60', key: 'total_taxas', label: 'Total taxas e aluguéis (R$)' },
    { num: '61', key: 'total_materiais', label: 'Total materiais (R$)' },
    { num: '63', key: 'total_medicamentos', label: 'Total medicamentos (R$)' },
    { num: '65', key: 'total_geral', label: 'Total geral (R$)' },
    { num: '-', key: 'nome_operadora', label: 'Nome da operadora' },
    { num: '-', key: 'confidence_score', label: 'Confiança da extração' }
  ];

  function formatVal(key, val, data) {
    if (key === 'lista_procedimentos') {
      var list = (data && data.lista_procedimentos) || [];
      if (list.length === 0) return '—';
      return list.map(function (p) {
        var v = p.valor != null ? ' R$ ' + Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        var q = (p.qtde_solic != null || p.qtde_aut != null) ? ' [' + (p.qtde_solic ?? '') + '/' + (p.qtde_aut ?? '') + ']' : '';
        return (p.codigo_tuss || '') + (p.tabela ? ' T' + p.tabela : '') + ' – ' + (p.descricao || '').substring(0, 35) + (p.descricao && p.descricao.length > 35 ? '…' : '') + q + v;
      }).join(' | ');
    }
    if (key === 'total_procedimentos' || key === 'total_taxas' || key === 'total_materiais' || key === 'total_medicamentos' || key === 'total_geral') {
      if (val == null || val === '') return '—';
      return 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (key === 'confidence_score' && (val !== '' && val != null)) {
      return (Number(val) * 100).toFixed(0) + '%';
    }
    return val !== undefined && val !== null && val !== '' ? String(val) : '—';
  }

  function fillTissTable(data) {
    var tbody = document.getElementById('tissTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    TISS_FIELDS.forEach(function (f) {
      var val = f.key === 'lista_procedimentos' ? null : (data[f.key] ?? '');
      var display = formatVal(f.key, val, data);
      var tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50';
      var tdNum = document.createElement('td');
      tdNum.className = 'px-4 py-2 font-mono text-slate-500';
      tdNum.textContent = f.num || '—';
      var tdLabel = document.createElement('td');
      tdLabel.className = 'px-4 py-2 font-medium text-slate-700';
      tdLabel.textContent = f.label || f.key;
      var tdVal = document.createElement('td');
      tdVal.className = 'px-4 py-2 text-slate-800 break-words max-w-md';
      tdVal.textContent = display || '—';
      tr.appendChild(tdNum);
      tr.appendChild(tdLabel);
      tr.appendChild(tdVal);
      tbody.appendChild(tr);
    });
  }

  function fillForm(data) {
    var guiaTipoVersao = document.getElementById('guiaTipoVersao');
    if (guiaTipoVersao) {
      var tipo = data.tipo_guia || '';
      var ver = data.versao_tiss || '';
      if (tipo || ver) {
        guiaTipoVersao.textContent = (tipo ? 'Guia: ' + tipo.replace(/_/g, ' ') : '') + (ver ? (tipo ? ' · TISS ' + ver : 'TISS ' + ver) : '');
        guiaTipoVersao.classList.remove('hidden');
      } else {
        guiaTipoVersao.classList.add('hidden');
      }
    }
    setVal('codigo_operadora', data.codigo_operadora);
    setVal('nome_operadora', data.nome_operadora);
    setVal('numero_guia_prestador', data.numero_guia_prestador);
    setVal('numero_guia_principal', data.numero_guia_principal);
    setVal('data_autorizacao', data.data_autorizacao);
    setVal('senha', data.senha);
    setVal('data_validade_senha', data.data_validade_senha);
    setVal('numero_guia_atribuido_operadora', data.numero_guia_atribuido_operadora);
    setVal('numero_carteirinha', data.numero_carteirinha);
    setVal('data_validade', data.data_validade);
    setVal('nome_paciente', data.nome_paciente);
    setVal('data_nascimento', data.data_nascimento);
    setVal('atendimento_rn', data.atendimento_rn);
    setVal('codigo_operadora_solicitante', data.codigo_operadora_solicitante);
    setVal('nome_contratado', data.nome_contratado);
    setVal('nome_profissional_solicitante', data.nome_profissional_solicitante);
    setVal('conselho_profissional', data.conselho_profissional);
    setVal('numero_conselho', data.numero_conselho);
    setVal('uf_conselho', data.uf_conselho);
    setVal('codigo_cbo', data.codigo_cbo);
    setVal('carater_atendimento', data.carater_atendimento);
    setVal('data_solicitacao', data.data_solicitacao);
    setVal('indicacao_clinica', data.indicacao_clinica);
    setVal('tipo_atendimento', data.tipo_atendimento);
    setVal('observacao_justificativa', data.observacao_justificativa);

    if (listaProcedimentos) {
      listaProcedimentos.innerHTML = '';
      var procedimentos = data.lista_procedimentos || [];
      procedimentos.forEach(function (p, idx) {
        var div = document.createElement('div');
        div.className = 'flex flex-wrap items-center gap-2 text-sm text-slate-700 border-b border-slate-100 pb-2 last:border-0 last:pb-0';
        var tabelaStr = (p.tabela && String(p.tabela).trim()) ? ' Tabela ' + String(p.tabela).trim() : '';
        var qtdeStr = (p.qtde_solic != null && p.qtde_solic !== '') || (p.qtde_aut != null && p.qtde_aut !== '') ? ' Qtde solic: ' + (p.qtde_solic ?? '—') + ' / aut: ' + (p.qtde_aut ?? '—') : '';
        var valorStr = p.valor != null && p.valor !== '' ? ' – R$ ' + Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        div.innerHTML = '<span class="font-mono text-slate-500">' + (p.codigo_tuss || '') + '</span>' + tabelaStr + ' – ' + (p.descricao || '') + (qtdeStr ? ' <span class="text-slate-500">(' + qtdeStr + ')</span>' : '') + valorStr;
        listaProcedimentos.appendChild(div);
      });
    }

    var faturamentoSection = document.getElementById('faturamentoSection');
    if (faturamentoSection) {
      var hasFat = data.status_guia || data.total_geral != null || data.total_procedimentos != null || data.total_materiais != null || data.total_taxas != null || data.total_medicamentos != null;
      faturamentoSection.classList.toggle('hidden', !hasFat);
      if (hasFat) {
        setVal('status_guia', data.status_guia);
        setVal('total_procedimentos', data.total_procedimentos != null ? Number(data.total_procedimentos).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
        setVal('total_taxas', data.total_taxas != null ? Number(data.total_taxas).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
        setVal('total_materiais', data.total_materiais != null ? Number(data.total_materiais).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
        setVal('total_medicamentos', data.total_medicamentos != null ? Number(data.total_medicamentos).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
        setVal('total_geral', data.total_geral != null ? Number(data.total_geral).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
      }
    }

    if (reviewBadge) {
      if (data.needs_manual_review) {
        reviewBadge.classList.remove('hidden');
      } else {
        reviewBadge.classList.add('hidden');
      }
    }

    var inputs = formSection ? formSection.querySelectorAll('input') : [];
    if (data.needs_manual_review) {
      inputs.forEach(function (inp) {
        inp.classList.add('border-amber-400', 'bg-amber-50/50');
      });
    } else {
      inputs.forEach(function (inp) {
        inp.classList.remove('border-amber-400', 'bg-amber-50/50');
      });
    }

    if (formErros) {
      if (data.erros && data.erros.length) {
        formErros.classList.remove('hidden');
        formErros.innerHTML = data.erros.map(function (e) {
          var msg = (e.mensagem || e.campo) + (e.detalhe ? ' ' + e.detalhe : '');
          return '<p class="text-amber-700 text-sm">' + msg + '</p>';
        }).join('');
      } else {
        formErros.classList.add('hidden');
        formErros.innerHTML = '';
      }
    }

    fillTissTable(data);
    if (formSection) formSection.classList.remove('hidden');
  }

  function resetUpload() {
    if (dropZoneContent) dropZoneContent.classList.remove('hidden');
    if (uploadProgress) uploadProgress.classList.add('hidden');
    setProgress(0, '');
    showError('');
    if (fileInput) fileInput.value = '';
    if (dropZone) dropZone.setAttribute('data-state', 'idle');
  }

  function doUpload(file) {
    showError('');
    if (dropZoneContent) dropZoneContent.classList.add('hidden');
    if (uploadProgress) uploadProgress.classList.remove('hidden');
    setProgress(20, 'Enviando imagem...');
    if (dropZone) dropZone.setAttribute('data-state', 'uploading');

    var formData = new FormData();
    formData.append('file', file);

    fetch('/api/atendimentos/upload-guia', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
      .then(function (r) {
        setProgress(70, 'Analisando layout da guia...');
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.statusText); });
        return r.json();
      })
      .then(function (json) {
        setProgress(100, 'Concluído.');
        if (json.success && json.data) {
          setTimeout(function () {
            resetUpload();
            fillForm(json.data);
          }, 400);
        } else {
          throw new Error(json.error || 'Resposta inválida');
        }
      })
      .catch(function (err) {
        showError(err.message || 'Falha ao processar a guia.');
        resetUpload();
      });
  }

  if (dropZone) dropZone.addEventListener('click', function () { fileInput && fileInput.click(); });
  if (dropZone) dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('border-emerald-500', 'bg-emerald-50/50'); });
  if (dropZone) dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('border-emerald-500', 'bg-emerald-50/50'); });
  if (dropZone) dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('border-emerald-500', 'bg-emerald-50/50');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && f.type && f.type.indexOf('image/') === 0) doUpload(f);
  });

  if (fileInput) fileInput.addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (f) doUpload(f);
  });

  if (btnNovaGuia) btnNovaGuia.addEventListener('click', function () {
    if (formSection) formSection.classList.add('hidden');
    resetUpload();
  });

  if (formConferencia) formConferencia.addEventListener('submit', function (e) {
    e.preventDefault();
    alert('Integração com abertura de atendimento no sistema será feita em etapa posterior. Os dados já estão preenchidos para conferência.');
  });

})();
