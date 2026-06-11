const API = 'http://127.0.0.1:3001';
const COLUMNS = ['triagem', 'aplicadas', 'favoritas', 'entrevista', 'finalizada'];
const COL_LABELS = { triagem: 'Triagem', favoritas: 'Favoritas', aplicadas: 'Aplicadas', entrevista: 'Entrevista', finalizada: 'Finalizada' };

let jobs = [];
let searchQuery = '';

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
      <h3>${COL_LABELS[col]} (${colJobs.length})</h3>
      ${colJobs.length === 0 ? '<div class="empty-state">Nenhuma vaga</div>' : colJobs.map(j => cardHTML(j)).join('')}
    `;
    section.addEventListener('dragover', e => e.preventDefault());
    section.addEventListener('drop', e => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      moveJob(id, col);
    });
    board.appendChild(section);
  }
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

// Nova Vaga
document.getElementById('btnNovaVaga').addEventListener('click', () => {
  document.getElementById('modalNovaVaga').classList.remove('hidden');
  document.getElementById('jobText').value = '';
  document.getElementById('extractStatus').textContent = '';
  document.getElementById('btnProcessar').disabled = true;
});

document.getElementById('btnCloseNova').addEventListener('click', () =>
  document.getElementById('modalNovaVaga').classList.add('hidden'));
document.getElementById('btnCancelNova').addEventListener('click', () =>
  document.getElementById('modalNovaVaga').classList.add('hidden'));

document.getElementById('jobText').addEventListener('input', e => {
  document.getElementById('btnProcessar').disabled = e.target.value.trim().length < 20;
});

document.getElementById('btnProcessar').addEventListener('click', async () => {
  const text = document.getElementById('jobText').value.trim();
  const statusEl = document.getElementById('extractStatus');
  const btn = document.getElementById('btnProcessar');
  btn.disabled = true; statusEl.className = 'modal-status loading';
  statusEl.innerHTML = '<span class="spinner"></span> Processando com Ollama...';
  try {
    const r = await fetch(`${API}/api/extract`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_text: text })
    });
    const result = await r.json();
    if (result.success) {
      statusEl.className = 'modal-status success';
      statusEl.textContent = `✅ ${result.data.job_title || 'Vaga'} — ${result.data.company || 'sem empresa'} salva com sucesso!`;
      document.getElementById('modalNovaVaga').classList.add('hidden');
      loadJobs();
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

async function generateCV(id) {
  const btn = document.getElementById('btnGenerateCV');
  const resultDiv = document.getElementById('cvResult');
  btn.disabled = true;
  btn.textContent = 'Gerando...';
  try {
    const r = await fetch(`${API}/api/jobs/${id}/generate-cv`, { method: 'POST' });
    const data = await r.json();
    if (data.success) {
      const cv = data.cv;
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
      setTimeout(() => { btn.textContent = 'Gerar CV Otimizado'; btn.disabled = false; }, 2000);
      // Salvar .txt em Downloads
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
    console.error('generateCV error:', e);
    btn.textContent = 'Erro';
    btn.disabled = false;
  }
}

async function exportPdf(id) {
  try {
    const r = await fetch(`${API}/api/jobs/${id}/export-pdf`, { method: 'POST' });
    const data = await r.json();
    if (data.success) {
      window.open(`${API}${data.url}`, '_blank');
    }
  } catch (e) {
    console.error('exportPdf error:', e);
  }
}

async function saveJobDetail(id) {
  const date = document.getElementById('editDate')?.value || '';
  const platform = document.getElementById('editPlatform')?.value.trim() || '';
  try {
    const r = await fetch(`${API}/api/jobs/${id}/details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applied_date: date || null, platform: platform || null })
    });
    const result = await r.json();
    if (result.success) {
      closeDetail();
      loadJobs();
    } else {
      console.error('save error:', result);
    }
  } catch (e) {
    console.error('save error:', e);
  }
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

  body.innerHTML = `
    ${score !== null ? `<div class="detail-score detail-full"><div class="detail-score-number" style="color:${scoreColor}">${score}%</div><div class="detail-score-label">Score de Matching</div><button class="btn-save" id="btnGenerateCV" onclick="generateCV(${job.id})" style="margin-top:12px">Gerar CV Otimizado</button><button class="btn-secondary" id="btnExportPdf" onclick="exportPdf(${job.id})" style="margin-top:6px">Exportar PDF</button><div id="cvResult" style="display:none;margin-top:12px"></div></div>` : ''}
    <div class="detail-grid-2col">
      <div class="detail-section">
        <h4>Empresa</h4>
        <p>${job.company && job.company !== 'null' ? job.company : '—'}</p>
        <div style="margin-top:12px">
          <h4>Senioridade</h4>
          <p>${job.seniority && job.seniority !== 'not_specified' ? job.seniority : '—'}</p>
        </div>
        <div style="margin-top:12px">
          <h4>Local</h4>
          <p>${job.location || '—'}</p>
        </div>
      </div>
      <div class="detail-section">
        <h4>Data de Aplicação</h4>
        <div class="detail-edit-row">
          <input type="date" class="detail-input" id="editDate" value="${job.applied_date || ''}">
        </div>
        <div style="margin-top:8px">
          <h4>Plataforma</h4>
          <div class="detail-edit-row">
            <input type="text" class="detail-input" id="editPlatform" value="${job.platform || ''}" placeholder="Ex: Gupy, LinkedIn...">
          </div>
        </div>
      </div>
      <div class="detail-section">
        <h4>Skills Requeridas (${skills.length})</h4>
        <div class="detail-tags">${skills.map(s => `<span class="detail-tag">${s}</span>`).join('') || '—'}</div>
      </div>
      <div class="detail-section">
        <h4>Diferenciais (${nice.length})</h4>
        <div class="detail-tags">${nice.map(s => `<span class="detail-tag">${s}</span>`).join('') || '—'}</div>
      </div>
      <div class="detail-section">
        <h4>Ferramentas</h4>
        <div class="detail-tags">${tools.map(s => `<span class="detail-tag">${s}</span>`).join('') || '—'}</div>
      </div>
      <div class="detail-section">
        <h4>Responsabilidades</h4>
        <p>${resp.map(r => '• ' + r).join('<br>') || '—'}</p>
      </div>
      <div class="detail-section">
        <h4>ATS Keywords</h4>
        <div class="detail-tags">${ats.map(s => `<span class="detail-tag">${s}</span>`).join('') || '—'}</div>
      </div>
    </div>
    ${job.job_text ? `
    <div class="detail-full" style="margin-top:16px">
      <h4 style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:8px;">Texto da Vaga</h4>
      <button class="job-text-toggle" id="jobTextToggle" onclick="toggleJobText()">
        <span class="arrow">&#9654;</span> Clique para ler o texto completo
      </button>
      <div class="job-text-content" id="jobTextContent">${escapeHtml(job.job_text)}</div>
    </div>
    ` : ''}
    <div class="detail-full detail-btn-row" style="margin-top:12px">
      <button class="btn-secondary" onclick="closeDetail()">Cancelar</button>
      <button class="btn-save" id="btnSaveDetail" onclick="saveJobDetail(${job.id})">Salvar</button>
    </div>
  `;
  document.getElementById('sideOverlay').classList.remove('hidden');
  document.getElementById('modalDetalhes').classList.remove('hidden');
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
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
  renderKanban();
});

// Init
loadJobs();
