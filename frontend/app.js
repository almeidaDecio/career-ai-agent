const API = 'http://127.0.0.1:3001';
const COLUMNS = ['triagem', 'aplicadas', 'favoritas', 'entrevista', 'finalizada'];
const COL_LABELS = { triagem: 'Triagem', favoritas: 'Favoritas', aplicadas: 'Aplicadas', entrevista: 'Entrevista', finalizada: 'Finalizada' };

let jobs = [];
let searchQuery = '';
let _cvGenerating = false;

async function loadJobs() {
  const r = await fetch(`${API}/api/jobs`);
  jobs = await r.json();
  renderKanban();
}

function renderKanban() {
  const board = document.getElementById('kanban');
  board.innerHTML = '';
  const q = searchQuery.toLowerCase();
  for (const col of COLUMNS) {
    let colJobs = jobs.filter(j => (j.status || 'triagem') === col);
    if (q) colJobs = colJobs.filter(j =>
      (j.job_title || '').toLowerCase().includes(q) ||
      (j.company || '').toLowerCase().includes(q) ||
      (j.platform || '').toLowerCase().includes(q) ||
      (j.location || '').toLowerCase().includes(q) ||
      (j.required_skills || []).some(s => s.toLowerCase().includes(q))
    );
    const section = document.createElement('div');
    section.className = 'kanban-col';
    section.dataset.col = col;
    section.innerHTML = `
      <div class="kanban-col-header">
        <span class="col-dot"></span>
        <h3>${COL_LABELS[col]}</h3>
        <span class="col-count">${colJobs.length}</span>
      </div>
      <div class="kanban-col-body">
        ${colJobs.length === 0 ? '<div class="empty-state">Nenhuma vaga</div>' : colJobs.map(j => cardHTML(j)).join('')}
      </div>
    `;
    section.addEventListener('dragover', e => e.preventDefault());
    section.addEventListener('drop', e => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      moveJob(id, col);
    });
    board.appendChild(section);
  }

  // Atualiza stats bar
  const total = jobs.length;
  const aplicadas = jobs.filter(j => (j.status || 'triagem') === 'aplicadas').length;
  const entrevistas = jobs.filter(j => (j.status || 'triagem') === 'entrevista').length;
  const scores = jobs.map(j => j.matching_score || j.score).filter(s => s != null && s > 0);
  const matchMedio = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) + '%'
    : '—';
  const elTotal = document.getElementById('statTotal');
  const elAplicadas = document.getElementById('statAplicadas');
  const elEntrevistas = document.getElementById('statEntrevistas');
  const elMatch = document.getElementById('statMatchMedio');
  if (elTotal) elTotal.textContent = total;
  if (elAplicadas) elAplicadas.textContent = aplicadas;
  if (elEntrevistas) elEntrevistas.textContent = entrevistas;
  if (elMatch) elMatch.textContent = matchMedio;
}

function daysSince(dateStr) {
  if (!dateStr) return -1;
  const d = new Date(dateStr);
  if (isNaN(d)) return -1;
  return Math.floor((Date.now() - d) / 86400000);
}

function cardHTML(j) {
  const score = j.matching_score || j.score || null;
  let scoreClass = score === null ? '' : score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low';
  const seniority = j.seniority === 'not_specified' ? '' : j.seniority || '';
  const company = j.company && j.company !== 'null' ? j.company : '';
  const title = j.job_title || 'Sem título';
  const platform = j.platform || '';
  const appliedDate = j.applied_date || '';
  const days = daysSince(appliedDate);
  let timeTag = '';
  if (days > 30) timeTag = '<span class="card-time-tag overdue">30+ dias</span>';
  else if (days > 15) timeTag = '<span class="card-time-tag warning">15+ dias</span>';
  return `
    <div class="card" draggable="true" data-id="${j.id}" onclick="openDetail(${j.id})">
      <button class="card-delete" onclick="event.stopPropagation();confirmDelete(${j.id})" title="Excluir">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>
      <div class="card-title">${title}</div>
      ${company ? `<div class="card-company">${company}</div>` : ''}
      ${score !== null ? `<div class="card-score-row"><span class="card-score-tag ${scoreClass}">${score}%</span>${timeTag}</div>` : ''}
      <div class="card-meta">
        ${platform ? `<span class="card-platform">${platform}</span>` : ''}
        ${appliedDate ? `<span class="card-date">${appliedDate}</span>` : ''}
      </div>
    </div>
  `;
}

let pendingDeleteId = null;

function confirmDelete(id) {
  pendingDeleteId = id;
  document.getElementById('modalConfirm').classList.remove('hidden');
}

async function deleteJob(id) {
  try {
    await fetch(`${API}/api/jobs/${id}`, { method: 'DELETE' });
    loadJobs();
  } catch {}
}

function moveJob(id, newStatus) {
  const job = jobs.find(j => j.id == id);
  if (!job || (job.status || 'triagem') === newStatus) return;
  job.status = newStatus;
  fetch(`${API}/api/jobs/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus })
  });
  loadJobs();
}

// Importar CV Externo
document.getElementById('btnImportarCV').addEventListener('click', () => {
  document.getElementById('modalImportarCV').classList.remove('hidden');
  document.getElementById('cvExternoText').value = '';
  document.getElementById('formatStatus').textContent = '';
  document.getElementById('btnFormatarCV').disabled = true;
});
document.getElementById('btnCloseImportarCV').addEventListener('click', () =>
  document.getElementById('modalImportarCV').classList.add('hidden'));
document.getElementById('btnCancelImportarCV').addEventListener('click', () =>
  document.getElementById('modalImportarCV').classList.add('hidden'));
document.getElementById('modalImportarCV').addEventListener('click', e => {
  if (e.target === e.currentTarget)
    document.getElementById('modalImportarCV').classList.add('hidden');
});
document.getElementById('cvExternoText').addEventListener('input', e => {
  document.getElementById('btnFormatarCV').disabled = e.target.value.trim().length < 50;
});
document.getElementById('btnFormatarCV').addEventListener('click', async () => {
  const text = document.getElementById('cvExternoText').value.trim();
  const statusEl = document.getElementById('formatStatus');
  const btn = document.getElementById('btnFormatarCV');
  btn.disabled = true; statusEl.className = 'modal-status loading';
  statusEl.innerHTML = '<span class="spinner"></span> Processando com Ollama...';
  try {
    const r = await fetch(`${API}/api/cv/format`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cv_text: text })
    });
    const result = await r.json();
    if (result.success) {
      statusEl.className = 'modal-status success';
      statusEl.textContent = '✅ CV formatado!';
      document.getElementById('modalImportarCV').classList.add('hidden');
      window.open(`${API}${result.url}`, '_blank');
    } else {
      statusEl.className = 'modal-status error';
      statusEl.textContent = `❌ ${result.error}`;
    }
  } catch (e) {
    statusEl.className = 'modal-status error';
    statusEl.textContent = `❌ Erro de conexão: ${e.message}`;
  }
  btn.disabled = false;
});

// Nova Vaga
document.getElementById('btnNovaVaga').addEventListener('click', () => {
  document.getElementById('modalNovaVaga').classList.remove('hidden');
  document.getElementById('empresaContext').value = '';
  document.getElementById('requisitosVaga').value = '';
  document.getElementById('extractStatus').textContent = '';
  document.getElementById('btnProcessar').disabled = true;
});

document.getElementById('btnCloseNova').addEventListener('click', () =>
  document.getElementById('modalNovaVaga').classList.add('hidden'));
document.getElementById('btnCancelNova').addEventListener('click', () =>
  document.getElementById('modalNovaVaga').classList.add('hidden'));

document.getElementById('requisitosVaga').addEventListener('input', e => {
  document.getElementById('btnProcessar').disabled = e.target.value.trim().length < 20;
});

document.getElementById('btnProcessar').addEventListener('click', async () => {
  const empresa = document.getElementById('empresaContext').value.trim();
  const requisitos = document.getElementById('requisitosVaga').value.trim();
  const statusEl = document.getElementById('extractStatus');
  const btn = document.getElementById('btnProcessar');
  btn.disabled = true; statusEl.className = 'modal-status loading';
  statusEl.innerHTML = '<span class="spinner"></span> Processando com Ollama...';
  try {
    const r = await fetch(`${API}/api/extract`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa_context: empresa, requisitos })
    });
    const result = await r.json();
    if (result.success) {
      statusEl.className = 'modal-status success';
      statusEl.textContent = `✅ ${result.data.job_title || 'Vaga'} — ${result.data.company || 'sem empresa'} salva! Gerando CV...`;
      document.getElementById('modalNovaVaga').classList.add('hidden');
      loadJobs();
      setTimeout(() => generateCV(result.id), 500);
    } else {
      statusEl.className = 'modal-status error';
      statusEl.textContent = `❌ ${result.error}`;
    }
  } catch (e) {
    statusEl.className = 'modal-status error';
    statusEl.textContent = `❌ Erro de conexão: ${e.message}`;
    showError('Erro de conexão', 'Não foi possível conectar ao servidor. Verifique se o Express está rodando.', `POST /api/extract — ${e.message}`);
  }
  btn.disabled = false;
});

document.getElementById('jobFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('attachName').textContent = file.name;
  if (file.type === 'text/plain') {
    const text = await file.text();
    const ta = document.getElementById('requisitosVaga');
    if (!ta.value.trim()) ta.value = text;
    document.getElementById('btnProcessar').disabled = ta.value.trim().length < 20;
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  const statusEl = document.getElementById('extractStatus');
  statusEl.className = 'modal-status loading';
  statusEl.innerHTML = '<span class="spinner"></span> Lendo arquivo...';
  try {
    const r = await fetch(`${API}/api/upload/job-file`, { method: 'POST', body: formData });
    const data = await r.json();
    if (data.success) {
      statusEl.className = 'modal-status success';
      statusEl.textContent = `📎 ${file.name} anexado`;
    } else {
      statusEl.className = 'modal-status error';
      statusEl.textContent = `❌ ${data.error}`;
    }
  } catch (err) {
    statusEl.className = 'modal-status error';
    statusEl.textContent = '❌ Erro ao enviar arquivo';
  }
});

async function generateCV(id) {
  _cvGenerating = true;
  const btn = document.getElementById('btnGenerateCV');
  const resultDiv = document.getElementById('cvResult');
  btn.disabled = true;
  btn.textContent = 'Gerando...';
  try {
    const r = await fetch(`${API}/api/jobs/${id}/generate-cv`, { method: 'POST' });
    const data = await r.json();
    if (data.success) {
      const cv = data.cv;
      const adjScore = data.adjusted_score;

      // Atualizar card de match do CV ajustado
      if (adjScore != null) {
        const adjColor = adjScore >= 80 ? 'var(--green)' : adjScore >= 50 ? 'var(--yellow)' : 'var(--red)';
        const cardAdj = document.getElementById('cardAdjustedScore');
        const fillAdj = document.getElementById('adjScoreFill');
        const valAdj  = document.getElementById('adjScoreValue');
        if (cardAdj) { cardAdj.classList.remove('info-card-disabled'); }
        if (fillAdj) { fillAdj.style.width = adjScore + '%'; fillAdj.style.background = adjColor; }
        if (valAdj)  { valAdj.textContent = adjScore + '%'; valAdj.style.color = adjColor; }
      }
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `
        <div style="background:var(--surface2);border-radius:10px;padding:16px">
          <div style="font-size:15px;font-weight:600;margin-bottom:4px">${cv.name}</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:12px">${cv.current_title}</div>
          <div style="font-size:13px;line-height:1.5;margin-bottom:12px">${cv.summary}</div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:6px">Skills em ordem</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${cv.skills_ordered.map(s => {
              const isMatch = cv.matched_skills.includes(s);
              return `<span style="font-size:12px;padding:3px 8px;border-radius:6px;background:${isMatch ? 'rgba(34,197,94,.15)' : 'var(--surface)'};color:${isMatch ? 'var(--green)' : 'var(--text2)'};border:1px solid ${isMatch ? 'var(--green)' : 'var(--border)'}">${s}</span>`;
            }).join('')}
          </div>
        </div>
      `;
      btn.textContent = '✓ Gerado';
      setTimeout(() => { btn.textContent = 'Gerar Novo CV'; btn.disabled = false; }, 2000);
      try {
        const r2 = await fetch(`${API}/api/jobs/${id}/save-cv-file`, { method: 'POST' });
        const result2 = await r2.json();
        if (result2.success) {
          const saved = document.createElement('div');
          saved.style.cssText = 'font-size:12px;color:var(--green);margin-top:8px;text-align:center';
          saved.textContent = `📁 ${result2.filename}`;
          resultDiv.appendChild(saved);
        }
      } catch {}
    }
  } catch (e) {
    showError('Erro ao gerar CV', e.message, 'generateCV');
    btn.textContent = 'Gerar CV';
    btn.disabled = false;
  } finally {
    _cvGenerating = false;
  }
}

async function exportPdf(id) {
  try {
    const r = await fetch(`${API}/api/jobs/${id}/export-pdf`, { method: 'POST' });
    if (!r.ok) {
      const data = await r.json();
      if (data.error && data.error.includes('Gere o CV')) {
        showToast('Nenhum CV gerado ainda. Clique em "Gerar CV" primeiro.');
        return;
      }
      showError('Erro ao exportar PDF', data.error || r.statusText, 'exportPdf');
      return;
    }
    const data = await r.json();
    if (data.success) {
      window.open(`${API}${data.url}`, '_blank');
    }
  } catch (e) {
    showError('Erro ao exportar PDF', e.message, 'exportPdf');
  }
}

let _reviewBodyBackup = '';

async function openReviewCV(id) {
  try {
    const r = await fetch(`${API}/api/jobs/${id}/cv-cache`);
    const data = await r.json();
    if (!data.success) {
      showToast(data.error || 'Nenhum CV gerado ainda.');
      return;
    }
    const cv = data.cv;
    const body = document.getElementById('detailBody');
    _reviewBodyBackup = body.innerHTML;

    const sfExp = cv.experience.find(e => e.company.toLowerCase().includes('softfocus'));

    body.innerHTML = `
      <div style="margin-bottom:16px">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px">Revisar CV</div>

        <label style="font-size:11px;color:var(--text2);margin-bottom:4px;display:block">Resumo</label>
        <textarea id="cvReviewSummary" rows="4" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;resize:vertical;margin-bottom:12px">${escapeHtml(cv.summary)}</textarea>

        <label style="font-size:11px;color:var(--text2);margin-bottom:4px;display:block">Skills (uma por linha)</label>
        <textarea id="cvReviewSkills" rows="6" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;resize:vertical;margin-bottom:12px">${cv.skills_ordered.map(escapeHtml).join('\n')}</textarea>

        ${sfExp ? `
        <label style="font-size:11px;color:var(--text2);margin-bottom:4px;display:block">Entregas Softfocus (uma por linha)</label>
        <textarea id="cvReviewHighlights" rows="8" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;resize:vertical;margin-bottom:12px">${sfExp.highlights.map(escapeHtml).join('\n')}</textarea>

        <label style="font-size:11px;color:var(--text2);margin-bottom:4px;display:block">Resultados Softfocus</label>
        <textarea id="cvReviewResultados" rows="3" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;resize:vertical;margin-bottom:12px">${escapeHtml(sfExp.resultados || '')}</textarea>
        ` : ''}

        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn-secondary" onclick="closeReviewCV()" style="flex:1">Voltar</button>
          <button class="btn-primary" onclick="saveReviewCV(${id})" style="flex:1">Salvar</button>
        </div>
      </div>
    `;
  } catch (e) {
    showToast('Erro ao carregar CV para revisão.');
  }
}

function closeReviewCV() {
  const body = document.getElementById('detailBody');
  if (_reviewBodyBackup) body.innerHTML = _reviewBodyBackup;
}

async function saveReviewCV(id) {
  try {
    const r = await fetch(`${API}/api/jobs/${id}/cv-cache`);
    const data = await r.json();
    if (!data.success) { showToast('Erro ao carregar CV'); return; }
    const cv = data.cv;

    cv.summary = document.getElementById('cvReviewSummary').value.trim();
    cv.skills_ordered = document.getElementById('cvReviewSkills').value.split('\n').map(s => s.trim()).filter(Boolean);

    const sfExp = cv.experience.find(e => e.company.toLowerCase().includes('softfocus'));
    if (sfExp) {
      const highlightsEl = document.getElementById('cvReviewHighlights');
      if (highlightsEl) {
        sfExp.highlights = highlightsEl.value.split('\n').map(s => s.trim()).filter(Boolean);
      }
      const resultadosEl = document.getElementById('cvReviewResultados');
      if (resultadosEl) sfExp.resultados = resultadosEl.value.trim();
    }

    const saveR = await fetch(`${API}/api/jobs/${id}/cv-cache`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cv })
    });
    const saveData = await saveR.json();
    if (saveData.success) {
      showToast('CV salvo com sucesso!');
      if (saveData.adjusted_score != null) {
        const adjScore = saveData.adjusted_score;
        const adjColor = adjScore >= 80 ? 'var(--green)' : adjScore >= 50 ? 'var(--yellow)' : 'var(--red)';
        const cardAdj = document.getElementById('cardAdjustedScore');
        const fillAdj = document.getElementById('adjScoreFill');
        const valAdj  = document.getElementById('adjScoreValue');
        if (cardAdj) cardAdj.classList.remove('info-card-disabled');
        if (fillAdj) { fillAdj.style.width = adjScore + '%'; fillAdj.style.background = adjColor; }
        if (valAdj) { valAdj.textContent = adjScore + '%'; valAdj.style.color = adjColor; }
      }
      closeReviewCV();
      loadJobs();
    } else {
      showToast('Erro ao salvar: ' + saveData.error);
    }
  } catch (e) {
    showToast('Erro ao salvar CV.');
  }
}

async function saveJobDetail(id) {
  const genBtn = document.getElementById('btnGenerateCV');
  if (genBtn && genBtn.disabled) {
    showSaveWarning();
    return;
  }
  const date = document.getElementById('editDate')?.value || '';
  const platformEl = document.getElementById('editPlatform');
  const platform = platformEl?.value === '__outro__'
    ? (document.getElementById('editPlatformOutro')?.value.trim() || '')
    : (platformEl?.value.trim() || '');
  const location = document.getElementById('editLocation')?.value.trim() || '';
  const interview_type = document.getElementById('editInterviewType')?.value || '';
  const company = document.getElementById('editCompany')?.value.trim() || '';
  const seniority = document.getElementById('editSeniority')?.value || '';
  try {
    const r = await fetch(`${API}/api/jobs/${id}/details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applied_date: date || null,
        platform: platform || null,
        location: location || null,
        interview_type: interview_type || null,
        company: company || null,
        seniority: seniority || null
      })
    });
    const result = await r.json();
    if (result.success) { closeDetail(); loadJobs(); }
    else console.error('save error:', result);
  } catch (e) { console.error('save error:', e); }
}

function closeDetail() {
  document.getElementById('sideOverlay').classList.add('hidden');
  document.getElementById('modalDetalhes').classList.add('hidden');
}

function toggleJobText() {
  const toggle = document.getElementById('jobTextToggle');
  const content = document.getElementById('jobTextContent');
  const isOpen = content.classList.toggle('open');
  toggle.classList.toggle('open');
}

// Detalhes - Side Panel
async function openDetail(id) {
  const r = await fetch(`${API}/api/jobs/${id}`);
  const job = await r.json();
  document.getElementById('detailTitle').textContent = job.job_title || 'Vaga';
  const body = document.getElementById('detailBody');
  const score = job.matching_score || job.score || null;
  const skills = job.required_skills || [];
  const nice = job.nice_to_have_skills || [];
  const tools = job.tools || [];
  const ats = job.ats_keywords || [];
  const resp = job.responsibilities || [];

  const scoreColor = score === null ? '' : score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';

  const actionsEl = document.getElementById('sidePanelActions');
  const ringEl = document.getElementById('sidePanelRing');

  if (actionsEl) {
    actionsEl.innerHTML = `
      <button class="btn-action-primary" id="btnExportPdf" onclick="exportPdf(${job.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exportar PDF
      </button>
      <button class="btn-action-secondary" id="btnReviewCV" onclick="openReviewCV(${job.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        Revisar CV
      </button>
      <button class="btn-action-secondary" id="btnGenerateCV" onclick="generateCV(${job.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Gerar Novo CV
      </button>
    `;
  }

  if (ringEl) ringEl.innerHTML = '';

  const genAt = job.generated_at ? new Date(job.generated_at).toLocaleString('pt-BR') : null;

  body.innerHTML = `
    <div id="cvResult" style="display:none;margin-bottom:16px"></div>

    ${genAt ? `
    <div class="detail-gen-info">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>CV gerado em <strong>${genAt}</strong></span>
    </div>
    <hr class="side-panel-rule">
    ` : ''}

    <div class="info-cards-grid">

      <div class="info-card">
        <div class="info-card-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        </div>
        <div class="info-card-content">
          <span class="info-card-label">Empresa</span>
          <input type="text" class="detail-input info-card-input" id="editCompany" value="${job.company && job.company !== 'null' ? job.company : ''}" placeholder="—">
        </div>
      </div>

      ${score !== null ? `
      <div class="info-card info-card-match">
        <div class="match-bg-fill" style="width:${score}%; background:${scoreColor};"></div>
        <div class="info-card-content" style="width:100%;">
          <span class="info-card-label">Match entre vaga e CV base</span>
          <span class="match-bar-value" style="color:${scoreColor}">${score}%</span>
        </div>
      </div>
      ` : '<div class="info-card"><div class="info-card-content"><span class="info-card-label">Match entre vaga e CV base</span><span class="info-card-value">—</span></div></div>'}

      <div class="info-card">
        <div class="info-card-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        </div>
        <div class="info-card-content">
          <span class="info-card-label">Senioridade</span>
          <select class="detail-input info-card-select" id="editSeniority">
            <option value="">— Selecione —</option>
            <option value="nao_informada" ${job.seniority === 'nao_informada' ? 'selected' : ''}>Não informada</option>
            <option value="junior"  ${job.seniority === 'junior' ? 'selected' : ''}>Júnior</option>
            <option value="pleno"   ${job.seniority === 'pleno' ? 'selected' : ''}>Pleno</option>
            <option value="senior"  ${job.seniority === 'senior' || job.seniority === 'lead' ? 'selected' : ''}>Senior</option>
          </select>
        </div>
      </div>

      <div class="info-card info-card-match ${job.adjusted_score == null ? 'info-card-disabled' : ''}" id="cardAdjustedScore">
        <div class="match-bg-fill" id="adjScoreFill" style="width:${job.adjusted_score || 0}%; background:${job.adjusted_score >= 80 ? 'var(--green)' : job.adjusted_score >= 50 ? 'var(--yellow)' : 'var(--red)'};"></div>
        <div class="info-card-content" style="width:100%;">
          <span class="info-card-label">Match entre vaga e CV ajustado</span>
          <span class="match-bar-value" id="adjScoreValue" style="color:${job.adjusted_score >= 80 ? 'var(--green)' : job.adjusted_score >= 50 ? 'var(--yellow)' : 'var(--red)'}">${job.adjusted_score != null ? job.adjusted_score + '%' : '—'}</span>
        </div>
      </div>

      <div class="info-card">
        <div class="info-card-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <div class="info-card-content">
          <span class="info-card-label">Data de Aplicação</span>
          <input type="date" class="detail-input info-card-date" id="editDate" value="${job.applied_date || ''}">
        </div>
      </div>

      <div class="info-card">
        <div class="info-card-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <div class="info-card-content">
          <span class="info-card-label">Local</span>
          ${job.location && job.location !== 'null'
            ? `<span class="info-card-value" id="locationDisplay">${job.location}
                 <button class="location-edit-btn" onclick="enableLocationEdit()" title="Editar">✏️</button>
               </span>
               <div id="locationSearchWrap" style="display:none">${locationSearchHTML()}</div>`
            : `<div id="locationSearchWrap">${locationSearchHTML()}</div>
               <span class="info-card-value" id="locationDisplay" style="display:none"></span>`
          }
        </div>
      </div>

      <div class="info-card">
        <div class="info-card-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        </div>
        <div class="info-card-content">
          <span class="info-card-label">Plataforma</span>
          <select class="detail-input info-card-select" id="editPlatform" onchange="handlePlatformChange(this)">
            <option value="">— Selecione —</option>
            <option value="Gupy"       ${job.platform === 'Gupy'       ? 'selected' : ''}>Gupy</option>
            <option value="LinkedIn"   ${job.platform === 'LinkedIn'   ? 'selected' : ''}>LinkedIn</option>
            <option value="Glassdoor"  ${job.platform === 'Glassdoor'  ? 'selected' : ''}>Glassdoor</option>
            <option value="Própria"    ${job.platform === 'Própria'    ? 'selected' : ''}>Própria</option>
            <option value="Indeed"     ${job.platform === 'Indeed'     ? 'selected' : ''}>Indeed</option>
            <option value="Catho"      ${job.platform === 'Catho'      ? 'selected' : ''}>Catho</option>
            <option value="InfoJobs"   ${job.platform === 'InfoJobs'   ? 'selected' : ''}>InfoJobs</option>
            ${customPlatformOption(job.platform)}
            <option value="__outro__">Outro...</option>
          </select>
          <input type="text" class="detail-input info-card-input" id="editPlatformOutro"
            placeholder="Digite a plataforma..."
            style="display:none;margin-top:6px"
            onblur="savePlatformOther(this)">
        </div>
      </div>

      <div class="info-card">
        <div class="info-card-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.1a16 16 0 0 0 6 6l.86-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.58 16z"/></svg>
        </div>
          <div class="info-card-content">
          <span class="info-card-label">Tipo de Entrevista</span>
          <select class="detail-input info-card-select" id="editInterviewType">
            <option value="">— Selecione —</option>
            <option value="whatsapp" ${job.interview_type === 'whatsapp' ? 'selected' : ''}>📱 WhatsApp</option>
            <option value="video" ${job.interview_type === 'video' ? 'selected' : ''}>🎥 Vídeo</option>
          </select>
        </div>
      </div>

    </div>

    <div class="detail-grid-2col" style="margin-top:20px">
      <div class="detail-section">
        <h4>Skills Requeridas <span class="section-count">${skills.length}</span></h4>
        <div class="detail-tags">
          ${skills.map(s => `<span class="detail-tag">${s}</span>`).join('') || '<span style="color:var(--text2);font-size:13px">—</span>'}
        </div>
      </div>
      <div class="detail-section">
        <h4>Diferenciais <span class="section-count">${nice.length}</span></h4>
        <div class="detail-tags">
          ${nice.map(s => `<span class="detail-tag">${s}</span>`).join('') || '<span style="color:var(--text2);font-size:13px">—</span>'}
        </div>
      </div>
      <div class="detail-section">
        <h4>Ferramentas Exigidas</h4>
        <div class="detail-tags">
          ${tools.map(s => `<span class="detail-tag">${s}</span>`).join('') || '<span style="color:var(--text2);font-size:13px">—</span>'}
        </div>
      </div>
      <div class="detail-section">
        <h4>ATS Keywords</h4>
        <div class="detail-tags">
          ${ats.map(s => `<span class="detail-tag">${s}</span>`).join('') || '<span style="color:var(--text2);font-size:13px">—</span>'}
        </div>
      </div>
      <div class="detail-section detail-full">
        <h4>Responsabilidades</h4>
        <p>${resp.map(r => '• ' + r).join('<br>') || '—'}</p>
      </div>
    </div>

    <div style="margin-top:20px">
      <label class="btn-attach-sm" for="attachInput" style="font-size:12px;padding:6px 12px;border-radius:6px;border:1px solid var(--border);display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:var(--text);background:var(--bg)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        Adicionar anexo
      </label>
      <input type="file" id="attachInput" multiple
        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
        style="display:none"
        onchange="uploadAttachments(${job.id}, this)">
      <div id="attachList" class="attach-list" style="margin-top:10px">
        <div class="attach-loading">Carregando...</div>
      </div>
    </div>

    ${job.job_text || job.requisitos ? `
    <div style="margin-top:20px">
      <h4 style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:8px">Texto da Vaga</h4>
      <button class="job-text-toggle" id="jobTextToggle" onclick="toggleJobText()">
        <span class="arrow">&#9654;</span> Clique para ler o texto completo
      </button>
      <div class="job-text-content" id="jobTextContent">
        ${job.empresa_context ? `<div style="margin-bottom:12px"><strong style="font-size:12px;color:var(--text)">Sobre a Empresa</strong>
${escapeHtml(job.empresa_context)}</div>
<hr style="margin:12px 0;border:none;border-top:1px solid var(--border)">
<div><strong style="font-size:12px;color:var(--text)">Requisitos da Vaga</strong>
${escapeHtml(job.requisitos || job.job_text)}</div>` : escapeHtml(job.job_text || job.requisitos)}
      </div>
    </div>
    ` : ''}

    <div class="detail-full detail-btn-row" style="margin-top:20px">
      <button class="btn-secondary" onclick="closeDetail()">Cancelar</button>
      <button class="btn-save" id="btnSaveDetail" onclick="saveJobDetail(${job.id})">Salvar</button>
    </div>
  `;
  document.getElementById('sideOverlay').classList.remove('hidden');
  document.getElementById('modalDetalhes').classList.remove('hidden');
  loadAttachments(job.id);
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  const el = document.getElementById('toastMessage');
  if (!container || !el) return;
  el.textContent = msg;
  container.classList.remove('hidden');
  clearTimeout(container._timeout);
  container._timeout = setTimeout(() => container.classList.add('hidden'), 3000);
}

function showError(title, message, context) {
  const overlay = document.getElementById('modalError');
  document.getElementById('errorTitle').textContent = title;
  document.getElementById('errorMessage').textContent = message;
  const ctxEl = document.getElementById('errorContext');
  if (context) {
    ctxEl.style.display = 'block';
    ctxEl.textContent = context;
  } else {
    ctxEl.style.display = 'none';
  }
  overlay.classList.remove('hidden');
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileIcon(mimetype) {
  if (!mimetype) return '\uD83D\uDCCE';
  if (mimetype.includes('pdf')) return '\uD83D\uDCC4';
  if (mimetype.includes('word') || mimetype.includes('document')) return '\uD83D\uDCDD';
  if (mimetype.includes('image')) return '\uD83D\uDDBC';
  if (mimetype.includes('text')) return '\uD83D\uDCC3';
  return '\uD83D\uDCCE';
}

async function loadAttachments(jobId) {
  const list = document.getElementById('attachList');
  if (!list) return;
  try {
    const r = await fetch(`${API}/api/jobs/${jobId}/attachments`);
    const data = await r.json();
    if (!data.attachments || data.attachments.length === 0) {
      list.innerHTML = '<div class="attach-empty">Nenhum arquivo anexado</div>';
      return;
    }
    list.innerHTML = data.attachments.map(a => `
      <div class="attach-item" data-id="${a.id}">
        <span class="attach-icon">${fileIcon(a.mimetype)}</span>
        <a class="attach-name" href="${API}/api/attachments/${a.id}" target="_blank" title="${a.original_name}">
          ${a.original_name}
        </a>
        <span class="attach-size">${formatBytes(a.size)}</span>
        <button class="attach-delete" onclick="deleteAttachment(${a.id})" title="Remover">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<div class="attach-empty">Erro ao carregar anexos</div>';
  }
}

async function uploadAttachments(jobId, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const list = document.getElementById('attachList');

  for (const file of files) {
    const tempId = 'temp-' + Date.now();
    const tempEl = document.createElement('div');
    tempEl.className = 'attach-item attach-uploading';
    tempEl.id = tempId;
    tempEl.innerHTML = `
      <span class="attach-icon">${fileIcon(file.type)}</span>
      <span class="attach-name">${file.name}</span>
      <span class="attach-size">Enviando...</span>
    `;
    list.prepend(tempEl);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const r = await fetch(`${API}/api/jobs/${jobId}/attachments`, {
        method: 'POST', body: formData
      });
      const data = await r.json();
      if (!data.success) throw new Error(data.error);
    } catch (e) {
      document.getElementById(tempId)?.remove();
      alert(`Erro ao enviar ${file.name}: ${e.message}`);
    }
  }

  input.value = '';
  await loadAttachments(jobId);
}

function showConfirm(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.style.zIndex = '200';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-header">
        <h2>Confirmação</h2>
      </div>
      <div class="modal-body">
        <p style="font-size:14px;line-height:1.5">${message}</p>
      </div>
      <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-secondary" style="flex:1" id="_cfCancel">Cancelar</button>
        <button class="btn-primary" style="flex:1" id="_cfOk">Ok</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#_cfCancel').onclick = () => { overlay.remove(); };
  overlay.querySelector('#_cfOk').onclick = () => { overlay.remove(); onConfirm(); };
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
}

async function deleteAttachment(attachId) {
  showConfirm('Deseja remover este arquivo?', async () => {
    try {
      const r = await fetch(`${API}/api/attachments/${attachId}`, { method: 'DELETE' });
      const data = await r.json();
      if (data.success) {
        document.querySelector(`.attach-item[data-id="${attachId}"]`)?.remove();
        const list = document.getElementById('attachList');
        if (list && !list.querySelector('.attach-item')) {
          list.innerHTML = '<div class="attach-empty">Nenhum arquivo anexado</div>';
        }
      }
    } catch (e) { alert('Erro ao remover arquivo'); }
  });
}

// ── Plataforma custom ─────────────────────────────────
const KNOWN_PLATFORMS = ['Gupy','LinkedIn','Glassdoor','Própria','Indeed','Catho','InfoJobs'];

function getCustomPlatforms() {
  try { return JSON.parse(localStorage.getItem('customPlatforms') || '[]'); } catch { return []; }
}

function saveCustomPlatform(name) {
  if (!name || KNOWN_PLATFORMS.includes(name)) return;
  const existing = getCustomPlatforms();
  if (!existing.includes(name)) {
    existing.push(name);
    try {
      localStorage.setItem('customPlatforms', JSON.stringify(existing));
    } catch { /* modo privado ou storage indisponível */ }
  }
}

function customPlatformOption(current) {
  const customs = getCustomPlatforms();
  const isCustom = current && !KNOWN_PLATFORMS.includes(current) && current !== '__outro__';
  return customs
    .filter(p => p !== current)
    .map(p => `<option value="${p}">${p}</option>`)
    .join('') +
    (isCustom ? `<option value="${current}" selected>${current}</option>` : '');
}

function handlePlatformChange(select) {
  const outro = document.getElementById('editPlatformOutro');
  if (!outro) return;
  if (select.value === '__outro__') {
    outro.style.display = 'block';
    outro.focus();
  } else {
    outro.style.display = 'none';
  }
}

function savePlatformOther(input) {
  const val = input.value.trim();
  if (!val) return;
  saveCustomPlatform(val);
  const select = document.getElementById('editPlatform');
  if (!select) return;
  const opt = document.createElement('option');
  opt.value = val; opt.textContent = val; opt.selected = true;
  const outroOpt = select.querySelector('option[value="__outro__"]');
  select.insertBefore(opt, outroOpt);
  select.value = val;
  input.style.display = 'none';
}

// ── Busca de cidade ────────────────────────────────────
function locationSearchHTML() {
  return `
    <input type="text" class="detail-input info-card-input" id="editLocation"
      placeholder="Buscar cidade..." autocomplete="off"
      oninput="searchCities(this.value)">
    <ul class="city-suggestions" id="citySuggestions"></ul>
  `;
}

function enableLocationEdit() {
  document.getElementById('locationDisplay').style.display = 'none';
  document.getElementById('locationSearchWrap').style.display = 'block';
  document.getElementById('editLocation')?.focus();
}

let citySearchTimeout = null;
async function searchCities(query) {
  const list = document.getElementById('citySuggestions');
  if (!list) return;
  clearTimeout(citySearchTimeout);
  if (query.length < 2) { list.innerHTML = ''; list.style.display = 'none'; return; }
  citySearchTimeout = setTimeout(async () => {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=br&featuretype=city&format=json&limit=6`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      );
      const data = await r.json();
      if (!data.length) { list.innerHTML = '<li class="city-no-result">Nenhuma cidade encontrada</li>'; list.style.display = 'block'; return; }
      list.innerHTML = data.map(d => {
        const parts = d.display_name.split(',');
        const city = parts[0].trim();
        const state = parts.find(p => p.trim().length === 2)?.trim() || parts[1]?.trim() || '';
        const label = state ? `${city}, ${state}` : city;
        return `<li class="city-option" onclick="selectCity('${label.replace(/'/g, "\\'")}')">${label}</li>`;
      }).join('');
      list.style.display = 'block';
    } catch { list.innerHTML = ''; list.style.display = 'none'; }
  }, 500);
}

function selectCity(label) {
  const input = document.getElementById('editLocation');
  const list = document.getElementById('citySuggestions');
  if (input) input.value = label;
  if (list) { list.innerHTML = ''; list.style.display = 'none'; }
}

// ── Bloqueio de salvar durante geração ────────────────
function showSaveWarning() {
  let warn = document.getElementById('saveWarning');
  if (!warn) {
    warn = document.createElement('div');
    warn.id = 'saveWarning';
    warn.className = 'save-warning';
    warn.textContent = '\u23F3 Aguarde a geração do CV.';
    const btnRow = document.querySelector('.detail-btn-row');
    btnRow?.insertBefore(warn, btnRow.firstChild);
  }
  warn.style.display = 'block';
  setTimeout(() => { if (warn) warn.style.display = 'none'; }, 3000);
}

document.getElementById('btnCloseDetail').addEventListener('click', closeDetail);

// Drag and drop
document.addEventListener('dragstart', e => {
  const card = e.target.closest('.card');
  if (card) e.dataTransfer.setData('text/plain', card.dataset.id);
});

// Fechar modal ao clicar fora
document.getElementById('modalNovaVaga').addEventListener('click', e => {
  if (e.target === e.currentTarget)
    document.getElementById('modalNovaVaga').classList.add('hidden');
});
document.getElementById('sideOverlay').addEventListener('click', closeDetail);

// Toast dismiss on click
document.getElementById('toastContainer').addEventListener('click', () => {
  document.getElementById('toastContainer').classList.add('hidden');
});

// Error modal
document.getElementById('modalError').addEventListener('click', e => {
  if (e.target === e.currentTarget)
    document.getElementById('modalError').classList.add('hidden');
});
// btnCloseError aparece duas vezes no HTML (header X e footer Ok), ambos fecham
document.querySelectorAll('#btnCloseError').forEach(el => {
  el.addEventListener('click', () => document.getElementById('modalError').classList.add('hidden'));
});

// Confirm Delete modal
document.getElementById('btnConfirmDelete').addEventListener('click', () => {
  if (pendingDeleteId !== null) deleteJob(pendingDeleteId);
  pendingDeleteId = null;
  document.getElementById('modalConfirm').classList.add('hidden');
});
document.getElementById('btnCancelConfirm').addEventListener('click', () => {
  pendingDeleteId = null;
  document.getElementById('modalConfirm').classList.add('hidden');
});
document.getElementById('btnCloseConfirm').addEventListener('click', () => {
  pendingDeleteId = null;
  document.getElementById('modalConfirm').classList.add('hidden');
});
document.getElementById('modalConfirm').addEventListener('click', e => {
  if (e.target === e.currentTarget) {
    pendingDeleteId = null;
    document.getElementById('modalConfirm').classList.add('hidden');
  }
});

// Search
document.getElementById('searchInput').addEventListener('input', e => {
  searchQuery = e.target.value;
  const btnClear = document.getElementById('btnClearSearch');
  if (btnClear) {
    if (searchQuery.length > 0) btnClear.classList.remove('hidden');
    else btnClear.classList.add('hidden');
  }
  renderKanban();
});

document.getElementById('btnClearSearch')?.addEventListener('click', () => {
  const input = document.getElementById('searchInput');
  input.value = '';
  searchQuery = '';
  document.getElementById('btnClearSearch').classList.add('hidden');
  renderKanban();
  input.focus();
});

// Init
loadJobs();
