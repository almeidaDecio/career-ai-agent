const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { execFile } = require('child_process');
const matcher = require('./matcher');
const cvGenerator = require('./cv_generator');
const skillExpander = require('./skill_expander');
const multer = require('multer');

const app = express();
const PORT = 3001;
const OLLAMA_HOST = 'http://127.0.0.1:11434';
const OLLAMA_MODEL = 'job-analyzer';
const db = new Database(path.join(__dirname, '..', 'career_agent.db'));
const CV_PATH = path.join(__dirname, '..', 'sample_cv.json');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Listar todas as vagas
app.get('/api/jobs', (req, res) => {
  const rows = db.prepare('SELECT * FROM vagas ORDER BY id DESC').all();
  res.json(rows.map(r => ({
    ...r,
    required_skills: safeJson(r.required_skills),
    nice_to_have_skills: safeJson(r.nice_to_have_skills),
    responsibilities: safeJson(r.responsibilities),
    tools: safeJson(r.tools),
    ats_keywords: safeJson(r.ats_keywords)
  })));
});

// Pegar uma vaga por ID
app.get('/api/jobs/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM vagas WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Vaga não encontrada' });
  res.json({
    ...row,
    required_skills: safeJson(row.required_skills),
    nice_to_have_skills: safeJson(row.nice_to_have_skills),
    responsibilities: safeJson(row.responsibilities),
    tools: safeJson(row.tools),
    ats_keywords: safeJson(row.ats_keywords)
  });
});

// Caminhos fixos do scraper de LinkedIn (dentro da pasta do projeto)
const LINKEDIN_JOBS_DIR = path.join(__dirname, '..', 'linkedin-jobs');
const LINKEDIN_JOBS_PATH = path.join(LINKEDIN_JOBS_DIR, 'jobs_new.json');
const LINKEDIN_SCRIPT_PATH = path.join(LINKEDIN_JOBS_DIR, 'linkedin_jobs_designer.py');
const LINKEDIN_RUNS_PATH = path.join(LINKEDIN_JOBS_DIR, 'execucoes.json');
const LINKEDIN_MAX_RUNS_PER_DAY = 2;
const LINKEDIN_SCRIPT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min (script tem deadline interno de 4 min)

function hojeISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function lerExecucoesHoje() {
  try {
    const data = JSON.parse(fs.readFileSync(LINKEDIN_RUNS_PATH, 'utf8'));
    if (data.date !== hojeISO()) return 0; // virou o dia, zera contagem
    return data.count || 0;
  } catch {
    return 0;
  }
}

function registrarExecucao() {
  const count = lerExecucoesHoje() + 1;
  if (!fs.existsSync(LINKEDIN_JOBS_DIR)) fs.mkdirSync(LINKEDIN_JOBS_DIR, { recursive: true });
  fs.writeFileSync(LINKEDIN_RUNS_PATH, JSON.stringify({ date: hojeISO(), count }), 'utf8');
  return count;
}

// Importar vagas em lote do scraper de LinkedIn (triagem)
// Roda o script Python (que busca vagas reais no LinkedIn), espera terminar,
// lê o jobs_new.json gerado e cria um card por vaga. Limitado a
// LINKEDIN_MAX_RUNS_PER_DAY execuções por dia para evitar chamar atenção
// do LinkedIn com buscas repetidas do mesmo IP.
// Vagas com linkedin_job_id já visto antes entram marcadas como "repetida",
// em vez de serem ignoradas — fica visível pro usuário decidir o que fazer.
app.post('/api/jobs/import-batch', (req, res) => {
  const jaExecutou = lerExecucoesHoje();
  if (jaExecutou >= LINKEDIN_MAX_RUNS_PER_DAY) {
    return res.status(429).json({
      error: `Limite de ${LINKEDIN_MAX_RUNS_PER_DAY} buscas por dia atingido. Tente novamente amanhã.`,
      runs_today: jaExecutou
    });
  }

  if (!fs.existsSync(LINKEDIN_SCRIPT_PATH)) {
    return res.status(404).json({
      error: `Script não encontrado: ${LINKEDIN_SCRIPT_PATH}. Coloque o linkedin_jobs_designer.py dentro da pasta linkedin-jobs.`
    });
  }

  execFile('python', [LINKEDIN_SCRIPT_PATH], {
    timeout: LINKEDIN_SCRIPT_TIMEOUT_MS,
    env: { ...process.env, LINKEDIN_OUTPUT_DIR: LINKEDIN_JOBS_DIR }
  }, (err, stdout, stderr) => {
    const runsHoje = registrarExecucao();

    if (err) {
      console.error('import-batch: erro ao rodar script Python:', err.message, stderr);
      return res.status(500).json({
        error: `Falha ao rodar o scraper: ${err.message}`,
        runs_today: runsHoje
      });
    }

    try {
      if (!fs.existsSync(LINKEDIN_JOBS_PATH)) {
        return res.status(404).json({
          error: 'Script rodou mas jobs_new.json não foi encontrado.',
          runs_today: runsHoje
        });
      }

      const raw = fs.readFileSync(LINKEDIN_JOBS_PATH, 'utf8');
      const scrapedJobs = JSON.parse(raw);

      if (!Array.isArray(scrapedJobs)) {
        return res.status(400).json({ error: 'jobs_new.json não contém uma lista de vagas válida', runs_today: runsHoje });
      }

      const existingIds = new Set(
        db.prepare('SELECT linkedin_job_id FROM vagas WHERE linkedin_job_id IS NOT NULL').all()
          .map(r => r.linkedin_job_id)
      );

      let imported = 0;
      let repeated = 0;

      const insertStmt = db.prepare(`INSERT INTO vagas
        (job_title, company, location, linkedin_url, linkedin_job_id, import_status, status)
        VALUES (?, ?, ?, ?, ?, ?, 'triagem')`);

      for (const job of scrapedJobs) {
        const isRepeated = existingIds.has(job.id);
        insertStmt.run(
          job.title || null,
          job.company || null,
          job.location || null,
          job.url || null,
          job.id || null,
          isRepeated ? 'repetida' : 'sem_dados'
        );
        if (isRepeated) repeated++; else imported++;
        if (job.id) existingIds.add(job.id);
      }

      res.json({
        success: true, imported, repeated, total: scrapedJobs.length,
        runs_today: runsHoje, runs_max: LINKEDIN_MAX_RUNS_PER_DAY
      });
    } catch (e) {
      console.error('import-batch error:', e);
      res.status(500).json({ error: e.message, runs_today: runsHoje });
    }
  });
});

// Criar vaga
app.post('/api/jobs', (req, res) => {
  const v = req.body;
  const result = db.prepare(`INSERT INTO vagas
    (job_title, company, seniority, experience_years_min, location,
     required_skills, nice_to_have_skills, responsibilities, tools, ats_keywords,
     applied_date, platform)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    v.job_title || null,
    v.company || null,
    v.seniority || null,
    v.experience_years_min || null,
    v.location || null,
    JSON.stringify(v.required_skills || []),
    JSON.stringify(v.nice_to_have_skills || []),
    JSON.stringify(v.responsibilities || []),
    JSON.stringify(v.tools || []),
    JSON.stringify(v.ats_keywords || []),
    v.applied_date || null,
    v.platform || null
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

// Atualizar vaga (status)
app.put('/api/jobs/:id', (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: 'Campo status é obrigatório' });
  try {
    db.prepare('UPDATE vagas SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Salvar data de aplicação e plataforma (via POST form/JSON)
app.post('/api/jobs/:id/details', (req, res) => {
  try {
    const applied_date = req.body.applied_date || null;
    const platform = req.body.platform || null;
    const interview_type = req.body.interview_type || null;
    const location = req.body.location || null;
    const company = req.body.company || null;
    const seniority = req.body.seniority || null;
    db.prepare('UPDATE vagas SET applied_date = ?, platform = ?, interview_type = ?, location = ?, company = ?, seniority = ? WHERE id = ?')
      .run(applied_date, platform, interview_type, location, company, seniority, req.params.id);

    // Recalcular matching e adjusted_score
    const row = db.prepare('SELECT * FROM vagas WHERE id = ?').get(req.params.id);
    if (row) {
      const jobText = row.requisitos || row.job_text || '';
      const job = {
        job_title: row.job_title || null,
        required_skills: skillExpander.expand(safeJson(row.required_skills), jobText),
        nice_to_have_skills: skillExpander.expand(safeJson(row.nice_to_have_skills), jobText),
        tools: skillExpander.expand(safeJson(row.tools), jobText),
        ats_keywords: skillExpander.expand(safeJson(row.ats_keywords), jobText)
      };
      
      const match = matcher.run(job);
      if (match.score !== null) {
        db.prepare('UPDATE vagas SET matching_score = ? WHERE id = ?').run(match.score, req.params.id);
      }

      // Se já houver CV gerado no cache, recalcula o score do CV ajustado também
      const cachePath = path.join(__dirname, '..', 'data', `cv_cache_${req.params.id}.json`);
      if (fs.existsSync(cachePath)) {
        try {
          const cv = JSON.parse(fs.readFileSync(cachePath, 'utf8').trim().replace(/^\uFEFF/, ''));
          const sfExp = cv.experience.find(e => e.company.toLowerCase().includes('softfocus'));
          const ollamaResult = {
            resumo_ajustado: cv.summary,
            softfocus_cargo: sfExp ? sfExp.role : 'Product Designer',
            softfocus_periodo: sfExp && sfExp.period ? sfExp.period : 'jul/2021 – fev/2026',
            softfocus_resultados: sfExp && sfExp.resultados ? sfExp.resultados : '',
            softfocus_entregas_ajustadas: sfExp && sfExp.highlights ? sfExp.highlights : []
          };
          cvGenerator.generateHTML(cv, ollamaResult);

          const matchAdj = matcher.runWithCV(cv, job);
          if (matchAdj.score !== null) {
            db.prepare('UPDATE vagas SET adjusted_score = ? WHERE id = ?').run(matchAdj.score, req.params.id);
          }
        } catch (err) {
          console.error('Erro ao recalcular adjusted_score em details:', err);
        }
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error('details error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Recalcular matching score
app.post('/api/jobs/:id/recalculate', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM vagas WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Vaga não encontrada' });
    const jobText = row.requisitos || row.job_text || '';
    const job = {
      job_title: row.job_title || null,
      required_skills: skillExpander.expand(safeJson(row.required_skills), jobText),
      nice_to_have_skills: skillExpander.expand(safeJson(row.nice_to_have_skills), jobText),
      tools: skillExpander.expand(safeJson(row.tools), jobText),
      ats_keywords: skillExpander.expand(safeJson(row.ats_keywords), jobText)
    };
    const match = matcher.run(job);
    if (match.score !== null) {
      db.prepare('UPDATE vagas SET matching_score = ? WHERE id = ?').run(match.score, req.params.id);
    }
    res.json({ success: true, matching_score: match.score });
  } catch (e) {
    console.error('Recalculate error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Atualizar CV base (sample_cv.json)
app.post('/api/cv/base', (req, res) => {
  try {
    const { cv_json } = req.body;
    if (!cv_json) return res.status(400).json({ error: 'Campo cv_json é obrigatório' });
    const parsed = typeof cv_json === 'string' ? JSON.parse(cv_json) : cv_json;
    fs.writeFileSync(CV_PATH, JSON.stringify(parsed, null, 2), 'utf8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ler CV base atual
app.get('/api/cv/base', (req, res) => {
  try {
    const raw = fs.readFileSync(CV_PATH, 'utf8');
    res.json({ success: true, cv: JSON.parse(raw) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Parse CV texto puro para JSON estruturado via Ollama
app.post('/api/cv/parse', async (req, res) => {
  try {
    const { cv_text } = req.body;
    if (!cv_text) return res.status(400).json({ error: 'Campo cv_text é obrigatório' });
    const prompt = `Você é um extrator de dados de currículos. Analise o texto do CV abaixo e extraia as informações no formato JSON exato especificado.

Texto do CV:
${cv_text}

Retorno APENAS um JSON válido (sem markdown, sem explicações) com esta estrutura exata:
{
  "name": "Nome completo",
  "current_title": "Cargo atual",
  "email": "email",
  "phone": "telefone",
  "linkedin": "URL do LinkedIn",
  "portfolio": "URL do portfólio",
  "total_experience_years": número,
  "summary": "Resumo profissional de 2-3 parágrafos",
  "skills_ordered": ["skill1", "skill2", "skill3"],
  "categories": {
    "research": { "skills": ["skill1", "skill2"], "evidence": "..." },
    "interaction_design": { "skills": ["skill1", "skill2"], "evidence": "..." },
    "visual_design": { "skills": ["skill1", "skill2"], "evidence": "..." },
    "tools": { "skills": ["skill1", "skill2"], "evidence": "..." },
    "soft_skills": { "skills": ["skill1", "skill2"], "evidence": "..." },
    "business": { "skills": ["skill1", "skill2"], "evidence": "..." }
  },
  "experience": [
    { "company": "Empresa", "role": "Cargo", "years": número, "domain": "Domínio", "highlights": ["...", "..."], "skills": ["...", "..."] }
  ],
  "languages": [ { "language": "Idioma", "level": "Nível" } ],
  "education": [ { "degree": "Curso", "institution": "Instituição", "year": "ano" } ],
  "certifications": [ { "name": "Nome da certificação", "institution": "Instituição", "year": "ano" } ]
}

Preencha todas os campos com base no texto. Se uma categoria não tiver dados no texto, coloque array vazio. Use evidence baseado nas realizações descritas.`;
    const raw = await callOllama(prompt);
    const cv = extractJson(raw);
    res.json({ success: true, cv });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Formatar CV externo no padrão do projeto
app.post('/api/cv/format', async (req, res) => {
  try {
    let cv = req.body.cv_json;
    if (!cv) {
      const { cv_text } = req.body;
      if (!cv_text) return res.status(400).json({ error: 'Envie cv_text ou cv_json' });

      const prompt = `Você é um extrator de dados de currículos. Analise o texto do CV abaixo e extraia as informações no formato JSON exato especificado.

Texto do CV:
${cv_text}

Retorno APENAS um JSON válido (sem markdown, sem explicações) com esta estrutura exata:
{
  "name": "Nome completo",
  "current_title": "Cargo atual",
  "email": "email",
  "phone": "telefone",
  "linkedin": "URL do LinkedIn",
  "portfolio": "URL do portfólio",
  "total_experience_years": número,
  "summary": "Resumo profissional de 2-3 parágrafos",
  "skills_ordered": ["skill1", "skill2", "skill3"],
  "experience": [
    { "company": "Empresa", "role": "Cargo", "years": número, "domain": "Domínio", "highlights": ["...", "..."], "skills": ["...", "..."] }
  ],
  "languages": [ { "language": "Idioma", "level": "Nível" } ],
  "education": [ { "degree": "Curso", "institution": "Instituição", "year": "ano" } ],
  "certifications": [ { "name": "Nome da certificação", "institution": "Instituição", "year": "ano" } ]
}

Preencha todos os campos. Se não encontrar, deixe string vazia ou array vazio.`;
      const raw = await callOllama(prompt);
      cv = extractJson(raw);
    }

    cvGenerator.generateExternalHTML(cv);
    res.json({ success: true, url: '/cv_externo.html?print=true' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Gerar CV otimizado para a vaga
function generateCVHTML(cv, job, id) {
  cv.header_title = cvGenerator.computeHeaderTitle(cv, job);
  const sfExp = cv.experience.find(e => e.company.toLowerCase().includes('softfocus'));
  const ollamaResult = {
    resumo_ajustado: cv.summary,
    softfocus_cargo: sfExp ? sfExp.role : 'Product Designer',
    softfocus_periodo: sfExp && sfExp.period ? sfExp.period : 'jul/2021 – fev/2026',
    softfocus_resultados: sfExp && sfExp.resultados ? sfExp.resultados : '',
    softfocus_entregas_ajustadas: sfExp && sfExp.highlights ? sfExp.highlights : []
  };
  cvGenerator.generateHTML(cv, ollamaResult);
  try {
    const matcherAdj = require('./matcher');
    const matchAdj = matcherAdj.runWithCV(cv, job);
    if (matchAdj.score !== null) {
      db.prepare('UPDATE vagas SET adjusted_score = ? WHERE id = ?').run(matchAdj.score, id);
    }
    return matchAdj.score;
  } catch { return null; }
}

app.post('/api/jobs/:id/generate-cv', async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM vagas WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Vaga não encontrada' });
    const cachePath = path.join(__dirname, '..', 'data', `cv_cache_${req.params.id}.json`);
    const jobText = row.requisitos || row.job_text || '';
    const job = {
      job_title: row.job_title || null,
      required_skills: skillExpander.expand(safeJson(row.required_skills), jobText),
      nice_to_have_skills: skillExpander.expand(safeJson(row.nice_to_have_skills), jobText),
      tools: skillExpander.expand(safeJson(row.tools), jobText),
      ats_keywords: skillExpander.expand(safeJson(row.ats_keywords), jobText)
    };
    let cv;
    if (fs.existsSync(cachePath)) {
      cv = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      cv.header_title = cvGenerator.computeHeaderTitle(cv, job);
      fs.writeFileSync(cachePath, JSON.stringify(cv, null, 2), 'utf8');
      db.prepare('UPDATE vagas SET generated_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);
      const adjScore = generateCVHTML(cv, job, req.params.id);
      return res.json({ success: true, cv, adjusted_score: adjScore, cached: true });
    }
    if (req.body && req.body.cv_json) {
      const cvData = typeof req.body.cv_json === 'string' ? JSON.parse(req.body.cv_json) : req.body.cv_json;
      cv = cvGenerator.generateFromData(cvData, job);
    } else {
      cv = await cvGenerator.generateForJob(job);
    }

    cv.header_title = cvGenerator.computeHeaderTitle(cv, job);

    // Cache the Ollama-enhanced CV result
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, `cv_cache_${req.params.id}.json`), JSON.stringify(cv, null, 2), 'utf8');

    db.prepare('UPDATE vagas SET generated_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);

    const adjScore = generateCVHTML(cv, job, req.params.id);
    res.json({ success: true, cv, adjusted_score: adjScore });
  } catch (e) {
    console.error('generate-cv error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Ler CV cacheado para revisão
app.get('/api/jobs/:id/cv-cache', (req, res) => {
  try {
    const cachePath = path.join(__dirname, '..', 'data', `cv_cache_${req.params.id}.json`);
    if (!fs.existsSync(cachePath)) {
      return res.status(404).json({ error: 'Nenhum CV gerado ainda. Clique em "Gerar CV" primeiro.' });
    }
    const cv = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    res.json({ success: true, cv });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Salvar CV revisado no cache
app.put('/api/jobs/:id/cv-cache', (req, res) => {
  try {
    const cachePath = path.join(__dirname, '..', 'data', `cv_cache_${req.params.id}.json`);
    if (!fs.existsSync(cachePath)) {
      return res.status(404).json({ error: 'Nenhum CV gerado ainda.' });
    }
    const { cv, job_title } = req.body;
    if (!cv) return res.status(400).json({ error: 'Campo cv é obrigatório' });
    const row = db.prepare('SELECT * FROM vagas WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Vaga não encontrada' });

    const jobText = row.requisitos || row.job_text || '';
    const normalizedJobTitle = typeof job_title === 'string' ? (job_title.trim() || null) : row.job_title || null;
    const job = {
      job_title: normalizedJobTitle,
      required_skills: skillExpander.expand(safeJson(row.required_skills), jobText),
      nice_to_have_skills: skillExpander.expand(safeJson(row.nice_to_have_skills), jobText),
      tools: skillExpander.expand(safeJson(row.tools), jobText),
      ats_keywords: skillExpander.expand(safeJson(row.ats_keywords), jobText)
    };

    if ('job_title' in req.body) {
      db.prepare('UPDATE vagas SET job_title = ? WHERE id = ?').run(normalizedJobTitle, req.params.id);
    }

    const updatedCv = { ...cv, header_title: cvGenerator.computeHeaderTitle(cv, job) };
    fs.writeFileSync(cachePath, JSON.stringify(updatedCv, null, 2), 'utf8');

    // Recalcular o adjusted_score e atualizar o HTML gerado
    const sfExp = updatedCv.experience.find(e => e.company.toLowerCase().includes('softfocus'));
    const ollamaResult = {
      resumo_ajustado: updatedCv.summary,
      softfocus_cargo: sfExp ? sfExp.role : 'Product Designer',
      softfocus_periodo: sfExp && sfExp.period ? sfExp.period : 'jul/2021 – fev/2026',
      softfocus_resultados: sfExp && sfExp.resultados ? sfExp.resultados : '',
      softfocus_entregas_ajustadas: sfExp && sfExp.highlights ? sfExp.highlights : []
    };
    cvGenerator.generateHTML(updatedCv, ollamaResult);

    let score = null;
    const matchAdj = matcher.runWithCV(updatedCv, job);
    if (matchAdj.score !== null) {
      db.prepare('UPDATE vagas SET adjusted_score = ? WHERE id = ?').run(matchAdj.score, req.params.id);
      score = matchAdj.score;
    }

    res.json({ success: true, adjusted_score: score });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Gerar e salvar CV como .txt em Downloads
app.post('/api/jobs/:id/save-cv-file', async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM vagas WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Vaga não encontrada' });
    const cachePath = path.join(__dirname, '..', 'data', `cv_cache_${req.params.id}.json`);
    let cv;
    if (fs.existsSync(cachePath)) {
      cv = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } else if (req.body && req.body.cv_json) {
      const cvData = typeof req.body.cv_json === 'string' ? JSON.parse(req.body.cv_json) : req.body.cv_json;
      cv = cvGenerator.generateFromData(cvData, job);
    } else {
      const jobText = row.requisitos || row.job_text || '';
      const job = {
        job_title: row.job_title || null,
        required_skills: skillExpander.expand(safeJson(row.required_skills), jobText),
        nice_to_have_skills: skillExpander.expand(safeJson(row.nice_to_have_skills), jobText),
        tools: skillExpander.expand(safeJson(row.tools), jobText),
        ats_keywords: skillExpander.expand(safeJson(row.ats_keywords), jobText)
      };
      cv = await cvGenerator.generateForJob(job);
    }

    const summary = `${cv.summary}`;

    let output = `${cv.name}\nProduct Designer | Designer UX/UI | Service Designer | Designer de Produtos\n\ndecio.almeida.product.design@gmail.com | +55 11 99376-3161\nlinkedin.com/in/décio-d-almeida-74186621\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nRESUMO PROFISSIONAL\n\n${summary}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nCOMPETÊNCIAS\n\n${cv.skills_ordered.join(' · ')}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nEXPERIÊNCIA PROFISSIONAL\n\n`;

    (cv.experience || []).forEach((exp, i) => {
      output += `${exp.company} — ${exp.role}${exp.period ? ' | ' + exp.period : ''}\n\n`;
      if (exp.resultados) {
        output += `${exp.resultados}\n\n`;
      }
      if (exp.highlights && exp.highlights.length) {
        output += exp.highlights.map(h => '| ' + h).join('\n') + '\n\n';
      }
      if (exp.skills && exp.skills.length) {
        output += `Skills: ${exp.skills.join(' · ')}\n`;
      }
      if (i < cv.experience.length - 1) {
        output += `\n─────────────────────────────────────────────────\n\n`;
      }
    });

    output += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nFORMAÇÃO\n\n`;
    (cv.education || []).forEach(edu => {
      output += `${edu.degree}\n${edu.institution || ''}${edu.year ? ' | ' + edu.year : ''}\n\n`;
    });
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nIDIOMAS\n\n`;
    (cv.languages || []).forEach(lang => {
      output += `${lang.language} — ${lang.level}\n`;
    });

    const downloadsPath = path.join(require('os').homedir(), 'Downloads');
    const filename = `Decio_DAlmeida_Product_Designer.txt`;
    const filePath = path.join(downloadsPath, filename);
    fs.writeFileSync(filePath, output, 'utf8');

    res.json({ success: true, filename });
  } catch (e) {
    console.error('save-cv-file error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Salvar texto puro do CV como .txt em Downloads (rápido, sem Ollama)
app.post('/api/jobs/:id/save-cv-text', (req, res) => {
  try {
    const { cv_text } = req.body;
    if (!cv_text) return res.status(400).json({ error: 'Campo cv_text é obrigatório' });

    const row = db.prepare('SELECT * FROM vagas WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Vaga não encontrada' });

    const atsKeywords = safeJson(row.ats_keywords);
    const atsLine = atsKeywords.length ? `ATS Keywords: ${atsKeywords.slice(0, 5).join(', ')}` : '';

    const output = `CV OTIMIZADO — ${row.job_title || 'Vaga'}${row.company && row.company !== 'null' ? ` @ ${row.company}` : ''}
${atsLine ? '\n' + atsLine : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${cv_text.trim()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CV otimizado para a vaga: ${row.job_title || '—'}
${row.company && row.company !== 'null' ? `Empresa: ${row.company}\n` : ''}
Gerado por Career AI Agent em ${new Date().toLocaleDateString('pt-BR')}
`;

    const downloadsPath = path.join(require('os').homedir(), 'Downloads');
    const filename = `Decio_DAlmeida_Product_Designer.txt`;
    const filePath = path.join(downloadsPath, filename);
    fs.writeFileSync(filePath, output, 'utf8');

    res.json({ success: true, filename });
  } catch (e) {
    console.error('save-cv-text error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Gerar HTML do CV otimizado para visualização/impressão (usa cache do generate-cv)
app.post('/api/jobs/:id/export-pdf', async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM vagas WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Vaga não encontrada' });

    const cachePath = path.join(__dirname, '..', 'data', `cv_cache_${req.params.id}.json`);
    if (!fs.existsSync(cachePath)) {
      return res.status(400).json({ error: 'Gere o CV otimizado primeiro (botão "Gerar CV Otimizado")' });
    }

    const cv = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const jobText = row.requisitos || row.job_text || '';
    const job = {
      job_title: row.job_title || null,
      required_skills: skillExpander.expand(safeJson(row.required_skills), jobText),
      nice_to_have_skills: skillExpander.expand(safeJson(row.nice_to_have_skills), jobText),
      tools: skillExpander.expand(safeJson(row.tools), jobText),
      ats_keywords: skillExpander.expand(safeJson(row.ats_keywords), jobText)
    };
    cv.header_title = cvGenerator.computeHeaderTitle(cv, job);
    fs.writeFileSync(cachePath, JSON.stringify(cv, null, 2), 'utf8');
    const sfExp = cv.experience.find(e => e.company.toLowerCase().includes('softfocus'));
    const ollamaResult = {
      resumo_ajustado: cv.summary,
      softfocus_cargo: sfExp ? sfExp.role : 'Product Designer',
      softfocus_periodo: sfExp && sfExp.period ? sfExp.period : 'jul/2021 – fev/2026',
      softfocus_resultados: sfExp && sfExp.resultados ? sfExp.resultados : '',
      softfocus_entregas_ajustadas: sfExp && sfExp.highlights ? sfExp.highlights : []
    };
    cvGenerator.generateHTML(cv, ollamaResult);
    res.json({ success: true, url: '/cv_otimizado.html?print=true' });
  } catch (e) {
    console.error('export-pdf error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Deletar vaga
app.delete('/api/jobs/:id', (req, res) => {
  db.prepare('DELETE FROM vagas WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

function safeJson(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// Chamar Ollama local
function callOllama(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { temperature: 0 } });
    const req = http.request(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body).response); }
        catch (e) { reject(new Error('Falha ao ler resposta do Ollama')); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function extractJson(raw) {
  let cleaned = raw.trim();
  try { return JSON.parse(cleaned); } catch {}
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
  if (s !== -1 && e > s) { try { return JSON.parse(cleaned.slice(s, e + 1)); } catch {} }
  throw new Error('Não foi possível extrair JSON');
}

// Extrair vaga com Ollama e salvar
// Se job_id vier no corpo, atualiza uma vaga existente (caso de triagem do
// LinkedIn) em vez de criar uma nova — e limpa o import_status, fazendo o
// card voltar ao estado normal.
app.post('/api/extract', async (req, res) => {
  try {
    const { empresa_nome, empresa_context, requisitos, job_text, applied_date, job_title, job_id } = req.body;
    const requisitosText = requisitos || job_text || '';
    if (!requisitosText) return res.status(400).json({ error: 'Campo requisitos é obrigatório' });

    const fullText = [empresa_context, requisitosText].filter(Boolean).join('\n\n---\n\n');

    const extractPrompt = `Você é um extrator especializado em vagas de emprego para Product Design e UX.
Analise o texto da vaga abaixo e extraia TODAS as informações no formato JSON exato especificado.
Seja EXAUSTIVO na extração de skills — não omita nenhuma competência mencionada na vaga.

[TEXTO DA VAGA]
${requisitosText}

[REGRAS DE EXTRAÇÃO]
1. required_skills: Liste TODAS as competências, habilidades e experiências que a vaga descreve como necessárias ou obrigatórias. Inclua: metodologias (discovery, delivery, pesquisa, entrevistas, mapeamento de jornadas), soft skills (comunicação, autonomia, colaboração), contextos (B2B, SaaS, sistemas financeiros, fluxos complexos) e qualquer outra habilidade explicitamente exigida. Mínimo de 8 itens.
2. nice_to_have_skills: Liste competências descritas como diferenciais, desejáveis ou "será um diferencial". Mínimo de 3 itens se existirem.
3. tools: Liste APENAS ferramentas e softwares mencionados (ex: Figma, Amplitude, Mixpanel, Jira, Miro). Só ferramentas concretas.
4. ats_keywords: Liste as palavras-chave mais importantes para ATS — termos que aparecem com destaque ou repetição na vaga.
5. responsibilities: Liste as principais responsabilidades do cargo.
6. Extraia job_title, company, seniority (junior/mid/senior/lead), location, experience_years_min.

[FORMATO JSON — responda APENAS com este JSON, sem texto adicional]
{
  "job_title": "",
  "company": "",
  "seniority": "",
  "experience_years_min": null,
  "location": "",
  "required_skills": [],
  "nice_to_have_skills": [],
  "tools": [],
  "ats_keywords": [],
  "responsibilities": []
}`;

    const raw = await callOllama(extractPrompt);
    const v = extractJson(raw);

    v.job_title = job_title || v.job_title || null;
    v.required_skills = skillExpander.expand(v.required_skills || [], requisitosText);
    v.nice_to_have_skills = skillExpander.expand(v.nice_to_have_skills || [], requisitosText);
    v.tools = skillExpander.expand(v.tools || [], requisitosText);
    v.ats_keywords = skillExpander.expand(v.ats_keywords || [], requisitosText);

    const match = matcher.run(v);
    const matchingScore = match.score;

    let resultId;

    if (job_id) {
      // Vaga de triagem (importada do LinkedIn) sendo completada — UPDATE,
      // preserva linkedin_url/linkedin_job_id, limpa import_status.
      const existing = db.prepare('SELECT id FROM vagas WHERE id = ?').get(job_id);
      if (!existing) return res.status(404).json({ error: 'Vaga não encontrada' });

      db.prepare(`UPDATE vagas SET
          job_title = ?, company = ?, seniority = ?, experience_years_min = ?, location = ?,
          required_skills = ?, nice_to_have_skills = ?, responsibilities = ?, tools = ?, ats_keywords = ?,
          job_text = ?, matching_score = ?, empresa_context = ?, requisitos = ?, applied_date = ?,
          import_status = NULL
        WHERE id = ?`).run(
        v.job_title || null, empresa_nome || v.company || null, v.seniority || null,
        v.experience_years_min || null, v.location || null,
        JSON.stringify(v.required_skills || []), JSON.stringify(v.nice_to_have_skills || []),
        JSON.stringify(v.responsibilities || []), JSON.stringify(v.tools || []),
        JSON.stringify(v.ats_keywords || []),
        fullText,
        matchingScore,
        empresa_context || null,
        requisitosText,
        applied_date || null,
        job_id
      );
      resultId = Number(job_id);
    } else {
      // Fluxo normal de "Nova Vaga" — INSERT
      const result = db.prepare(`INSERT INTO vagas
        (job_title, company, seniority, experience_years_min, location,
         required_skills, nice_to_have_skills, responsibilities, tools, ats_keywords,
         job_text, matching_score, empresa_context, requisitos, applied_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        v.job_title || null, empresa_nome || v.company || null, v.seniority || null,
        v.experience_years_min || null, v.location || null,
        JSON.stringify(v.required_skills || []), JSON.stringify(v.nice_to_have_skills || []),
        JSON.stringify(v.responsibilities || []), JSON.stringify(v.tools || []),
        JSON.stringify(v.ats_keywords || []),
        fullText,
        matchingScore,
        empresa_context || null,
        requisitosText,
        applied_date || null
      );
      resultId = result.lastInsertRowid;
    }

    res.json({ success: true, id: resultId, data: v, matching_score: matchingScore });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Error handler global — sempre retorna JSON
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

// Adicionar colunas se não existirem
try { db.exec("ALTER TABLE vagas ADD COLUMN status TEXT DEFAULT 'triagem'"); } catch {}
try { db.exec("ALTER TABLE vagas ADD COLUMN applied_date TEXT"); } catch {}
try { db.exec("ALTER TABLE vagas ADD COLUMN platform TEXT"); } catch {}
try { db.exec("ALTER TABLE vagas ADD COLUMN job_text TEXT"); } catch {}
try { db.exec("ALTER TABLE vagas ADD COLUMN matching_score INTEGER"); } catch {}
try { db.exec("ALTER TABLE vagas ADD COLUMN adjusted_score INTEGER"); } catch {}
try { db.exec("ALTER TABLE vagas ADD COLUMN interview_type TEXT"); } catch {}
try { db.exec("ALTER TABLE vagas ADD COLUMN location TEXT"); } catch {}
try { db.exec("ALTER TABLE vagas ADD COLUMN generated_at TEXT"); } catch {}
try { db.exec("ALTER TABLE vagas ADD COLUMN empresa_context TEXT"); } catch {}
try { db.exec("ALTER TABLE vagas ADD COLUMN requisitos TEXT"); } catch {}
// Colunas da importação de vagas do LinkedIn (triagem)
try { db.exec("ALTER TABLE vagas ADD COLUMN linkedin_url TEXT"); } catch {}
try { db.exec("ALTER TABLE vagas ADD COLUMN linkedin_job_id TEXT"); } catch {}
try { db.exec("ALTER TABLE vagas ADD COLUMN import_status TEXT"); } catch {}

// Tabela de anexos
db.exec(`
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mimetype TEXT,
    size INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Listar anexos de uma vaga
app.get('/api/jobs/:id/attachments', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT id, original_name, mimetype, size, created_at FROM attachments WHERE job_id = ? ORDER BY created_at DESC'
    ).all(req.params.id);
    res.json({ success: true, attachments: rows });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Upload de anexo
app.post('/api/jobs/:id/attachments', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ success: false, error: 'Nenhum arquivo enviado' });
  try {
    db.prepare(
      'INSERT INTO attachments (job_id, filename, original_name, mimetype, size) VALUES (?, ?, ?, ?, ?)'
    ).run(
      req.params.id,
      req.file.filename,
      req.file.originalname,
      req.file.mimetype,
      req.file.size
    );
    res.json({ success: true, filename: req.file.filename, original_name: req.file.originalname });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Download/visualização de anexo
app.get('/api/attachments/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });
  res.sendFile(filePath);
});

// Excluir anexo
app.delete('/api/attachments/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT filename FROM attachments WHERE id = ?').get(req.params.id);
    if (!row) return res.json({ success: false, error: 'Não encontrado' });
    const filePath = path.join(uploadDir, row.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Upload de arquivo para nova vaga (rota separada para não conflitar com /api/jobs/:id)
app.post('/api/upload/job-file', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ success: false, error: 'Nenhum arquivo enviado' });
  res.json({ success: true, filename: req.file.filename, path: req.file.path });
});

// ── Graceful startup com liberação de porta ──────────
function checkPort(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

async function startServer() {
  const portFree = await checkPort(PORT);
  if (!portFree) {
    console.warn(`⚠️  Porta ${PORT} em uso. Aguardando 2s e tentando novamente...`);
    await new Promise(r => setTimeout(r, 2000));
    const retry = await checkPort(PORT);
    if (!retry) {
      console.error(`❌ Porta ${PORT} ainda ocupada. Rode: npx kill-port ${PORT}`);
      process.exit(1);
    }
  }
  const server = app.listen(PORT, '0.0.0.0', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let ip = '127.0.0.1';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) { ip = net.address; break; }
      }
    }
    console.log(`API rodando em:`);
    console.log(`  Local:    http://127.0.0.1:${PORT}`);
    console.log(`  Rede:     http://${ip}:${PORT}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Porta ${PORT} ocupada. Rode: npx kill-port ${PORT}`);
      process.exit(1);
    }
    throw err;
  });

  process.on('SIGTERM', () => {
    console.log('Encerrando servidor...');
    server.close(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    console.log('Encerrando servidor...');
    server.close(() => process.exit(0));
  });
}

startServer();
