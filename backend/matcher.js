const fs = require('fs');
const path = require('path');

const CV_PATH = path.join(__dirname, '..', 'sample_cv.json');
const PROFILE_PATH = path.join(__dirname, '..', 'career_profile.json');

const synonyms = {
  'usability testing': 'testes usabilidade',
  'user research': 'pesquisa usuario',
  'ux research': 'pesquisa usuario',
  'user flows': 'fluxos usuario',
  'journey mapping': 'jornada usuario',
  'customer journey': 'jornada cliente',
  'service blueprint': 'blueprint servico',
  'interaction design': 'design interacao',
  'prototyping': 'prototipacao',
  'ui design': 'design interface',
  'design systems': 'design system',
  'stakeholders': 'stakeholders',
  'nps': 'nps',
  'csat': 'csat',
  'lean inception': 'lean inception',
  'design thinking': 'design thinking',
  'design sprint': 'design sprint',
  'figma': 'figma'
};

const titleGroups = {
  product_design: ['product designer', 'designer de produto', 'ux designer', 'ux/ui designer', 'ui designer', 'product design'],
  service_design: ['designer de servico', 'service designer', 'design de servico'],
  ux_research: ['ux researcher', 'researcher', 'pesquisador ux', 'pesquisa ux'],
  product_manager: ['product manager', 'product owner', 'pm ', 'gerente de produto'],
  art_direction: ['diretor de arte', 'diretora de arte', 'art director', 'motion designer', 'designer grafico digital'],
  process_analyst: ['analista de processos', 'bpm', 'bpmn'],
  developer: ['desenvolvedor', 'developer', 'front end', 'frontend', 'full stack']
};

const profileDefaults = {
  'ingles': 3,
  'english': 3,
  'confluence': 0,
  'azure devops': 0,
  'html': 1,
  'css': 1,
  'javascript': 1,
  'react': 1,
  'sql': 1,
  'personas': 3,
  'jornada do usuario': 4,
  'jornada do usuário': 4,
  'customer journey': 4,
  'workshops': 3,
  'workshop': 3,
  'design sprint': 3,
  'nps': 2,
  'csat': 2,
  'figma': 4,
  'design systems': 4,
  'design system': 4,
  'ux research': 4,
  'entrevistas com usuarios': 4,
  'entrevistas com usuários': 4,
  'testes de usabilidade': 4,
  'product discovery': 4,
  'user flows': 4,
  'wireframes': 4,
  'prototipagem': 4,
  'ia aplicada ao design': 4,
  'metodologias ageis': 3,
  'metodologias ágeis': 3,
  'scrum': 3,
  'kanban': 3,
  'jira': 3,
  'b2b saas': 4,
  'segmento financeiro': 4
};

function loadCareerProfile() {
  try {
    const data = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
    const map = { ...profileDefaults };
    for (const item of (data.skills || [])) {
      if (item && item.name) map[normalize(item.name)] = Number(item.level || 0);
    }
    return map;
  } catch {
    return { ...profileDefaults };
  }
}

function normalize(s) {
  let r = String(s || '').toLowerCase();
  for (const [en, pt] of Object.entries(synonyms)) r = r.replaceAll(en, pt);
  return r
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s) {
  return new Set(normalize(s).split(' ').filter(w => w.length > 2));
}

function overlapRatio(a, b) {
  const A = [...tokenSet(a)];
  const B = [...tokenSet(b)];
  if (!A.length || !B.length) return 0;
  let hits = 0;
  for (const w of A) {
    if (B.some(t => t === w || (w.length >= 5 && t.length >= 5 && (w.includes(t) || t.includes(w) || w.slice(0, 5) === t.slice(0, 5))))) hits++;
  }
  return hits / A.length;
}

function buildCvTexts(cv) {
  const texts = [];
  const push = v => { if (v) texts.push(normalize(v)); };
  push(cv.summary);
  push(cv.current_title);
  push(cv.header_title);
  if (cv.categories) {
    for (const cat of Object.values(cv.categories)) {
      (cat.skills || []).forEach(push);
      push(cat.evidence);
    }
  }
  (cv.skills_ordered || []).forEach(push);
  (cv.experience || []).forEach(exp => {
    push(exp.company); push(exp.role); push(exp.domain); push(exp.resultados);
    (exp.highlights || []).forEach(push);
    (exp.skills || []).forEach(push);
  });
  (cv.education || []).forEach(edu => { push(edu.degree); push(edu.institution); });
  (cv.languages || []).forEach(lang => push(`${lang.language} ${lang.level}`));
  try {
    if (!cv.categories) {
      const baseCv = JSON.parse(fs.readFileSync(CV_PATH, 'utf8').trim().replace(/^\uFEFF/, ''));
      return buildCvTexts({ ...baseCv, ...cv, categories: baseCv.categories });
    }
  } catch {}
  texts.push(texts.join(' '));
  return texts;
}

function profileLevel(skillName, profile = loadCareerProfile()) {
  const ns = normalize(skillName);
  if (profile[ns] !== undefined) return profile[ns];
  for (const [k, v] of Object.entries(profile)) {
    if (k && (ns.includes(k) || k.includes(ns))) return v;
  }
  return null;
}

function hasSkill(skillName, cvTexts, profile = loadCareerProfile()) {
  const level = profileLevel(skillName, profile);
  if (level === 0) return false;
  if (level >= 2) return true;
  const ns = normalize(skillName);
  if (!ns) return false;
  const words = ns.split(' ').filter(w => w.length > 3);
  for (const text of cvTexts) {
    if (text.includes(ns)) return true;
    const textWords = text.split(' ').filter(w => w.length > 3);
    if (words.length > 0) {
      const matches = words.filter(w =>
        textWords.some(tw =>
          tw.includes(w) || w.includes(tw) ||
          (w.length >= 5 && tw.length >= 5 && w.substring(0, 5) === tw.substring(0, 5))
        )
      );
      if (matches.length / words.length >= 0.55) return true;
    }
  }
  return false;
}

function hasTool(toolName, cv, profile = loadCareerProfile()) {
  const level = profileLevel(toolName, profile);
  if (level === 0) return false;
  if (level >= 2) return true;
  const nt = normalize(toolName);
  const allSkills = [];
  if (cv.categories?.tools?.skills) allSkills.push(...cv.categories.tools.skills);
  if (cv.skills_ordered) allSkills.push(...cv.skills_ordered);
  (cv.experience || []).forEach(exp => { if (exp.skills) allSkills.push(...exp.skills); });
  return allSkills.some(skill => normalize(skill).includes(nt) || nt.includes(normalize(skill)));
}

function classifyJob(job) {
  const text = normalize([
    job.job_title,
    job.job_text,
    ...(job.required_skills || []),
    ...(job.responsibilities || []),
    ...(job.nice_to_have_skills || []),
    ...(job.tools || [])
  ].join(' '));
  const title = normalize(job.job_title || '');
  const scoreGroup = (arr) => arr.reduce((acc, key) => acc + (title.includes(normalize(key)) ? 3 : text.includes(normalize(key)) ? 1 : 0), 0);
  const scores = Object.fromEntries(Object.entries(titleGroups).map(([k, arr]) => [k, scoreGroup(arr)]));
  scores.product_design += ['figma', 'prototipacao', 'ux research', 'design system', 'product discovery'].filter(k => text.includes(normalize(k))).length;
  scores.service_design += ['blueprint', 'jornada', 'workshop', 'persona', 'stakeholder mapping'].filter(k => text.includes(normalize(k))).length;
  scores.product_manager += ['roadmap', 'backlog', 'releases', 'go to market', 'product manager', 'requisitos de produto'].filter(k => text.includes(normalize(k))).length;
  scores.art_direction += ['photoshop', 'illustrator', 'after effects', 'premiere', 'motion', 'campanhas', 'key visual', 'agencia'].filter(k => text.includes(normalize(k))).length;
  const [type] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] || ['product_design', 0];
  return { type, scores };
}

function functionCompatibility(jobType, cv) {
  const title = normalize(cv.current_title || '');
  const cvText = buildCvTexts(cv).join(' ');
  if (jobType === 'product_design') return 92;
  if (jobType === 'service_design') return (cvText.includes('jornada') || cvText.includes('user flows')) ? 72 : 58;
  if (jobType === 'ux_research') return cvText.includes('pesquisa usuario') || cvText.includes('entrevistas') ? 78 : 62;
  if (jobType === 'process_analyst') return 55;
  if (jobType === 'product_manager') return title.includes('product manager') ? 70 : 38;
  if (jobType === 'art_direction') return 42;
  if (jobType === 'developer') return 25;
  return 60;
}

function detectRisks(job, jobType, cv, profile) {
  const text = normalize(JSON.stringify(job));
  const risks = [];
  if (jobType === 'product_manager') risks.push({ type: 'role_mismatch', penalty: 18, message: 'Vaga de Product Manager/PO tem escopo diferente de Product Designer.' });
  if (jobType === 'art_direction') risks.push({ type: 'role_mismatch', penalty: 16, message: 'Vaga de Direção de Arte exige repertório/ferramentas não comprovados no CV.' });
  if (/ingles avancado|english advanced|ingles fluente|fluent english|advanced english/.test(text)) {
    risks.push({ type: 'language', penalty: 6, message: 'Inglês intermediário: não bloqueia, mas é risco para vaga com inglês avançado/fluente.' });
  }
  const blockedTools = ['confluence', 'azure devops'];
  blockedTools.forEach(t => { if (text.includes(t) && profileLevel(t, profile) === 0) risks.push({ type: 'tool_gap', penalty: 4, message: `${t} marcado como não conhecido no perfil.` }); });
  return risks;
}

function calculateStrictScore(cv, job) {
  const profile = loadCareerProfile();
  const cvTexts = buildCvTexts(cv);
  const required = job.required_skills || [];
  const nice = job.nice_to_have_skills || [];
  const tools = job.tools || [];
  const ats = job.ats_keywords || [];
  const { type: jobType } = classifyJob(job);

  const matchedRequired = required.filter(s => hasSkill(s, cvTexts, profile));
  const matchedNice = nice.filter(s => hasSkill(s, cvTexts, profile));
  const matchedTools = tools.filter(s => hasTool(s, cv, profile));
  const matchedAts = ats.filter(kw => hasSkill(kw, cvTexts, profile));

  const requiredScore = required.length ? matchedRequired.length / required.length : 0.75;
  const niceScore = nice.length ? matchedNice.length / nice.length : 0.75;
  const toolsScore = tools.length ? matchedTools.length / tools.length : 0.75;
  const keywordsScore = Math.min(1, requiredScore * 0.75 + niceScore * 0.25);
  const evidenceScore = Math.min(1, (matchedRequired.length + matchedNice.length + matchedTools.length) / Math.max(1, required.length + nice.length + tools.length));
  const functionScore = functionCompatibility(jobType, cv) / 100;
  const seniorityScore = normalize(JSON.stringify(job)).includes('senior') || normalize(JSON.stringify(job)).includes('sr') ? (Number(cv.total_experience_years || 4.7) >= 4 ? 0.9 : 0.55) : 0.85;
  const toolMethodScore = toolsScore;
  const risks = detectRisks(job, jobType, cv, profile);
  const riskPenalty = Math.min(0.35, risks.reduce((sum, r) => sum + r.penalty, 0) / 100);
  const riskScore = Math.max(0, 1 - riskPenalty);

  const raw = (
    functionScore * 30 +
    evidenceScore * 25 +
    keywordsScore * 20 +
    seniorityScore * 10 +
    toolMethodScore * 10 +
    riskScore * 5
  );

  // Conservador: vagas incompatíveis têm teto de score, mesmo com palavras parecidas.
  let capped = raw;
  if (jobType === 'product_manager') capped = Math.min(capped, 55);
  if (jobType === 'art_direction') capped = Math.min(capped, 52);
  if (jobType === 'developer') capped = Math.min(capped, 35);

  const score = Math.max(0, Math.min(100, Math.round(capped)));
  const atsScore = ats.length > 0 ? Math.round((matchedAts.length / ats.length) * 100) : Math.round(keywordsScore * 100);
  const decision = score >= 80 ? 'aplicar' : score >= 70 ? 'avaliar' : score >= 60 ? 'baixa prioridade' : 'não priorizar';

  return {
    score,
    atsScore,
    matchedRequired,
    matchedNice,
    matchedTools,
    matchedAts,
    missingRequired: required.filter(s => !matchedRequired.includes(s)),
    missingNice: nice.filter(s => !matchedNice.includes(s)),
    missingTools: tools.filter(s => !matchedTools.includes(s)),
    jobType,
    decision,
    risks,
    scoreBreakdown: {
      compatibilidade_funcao: Math.round(functionScore * 100),
      evidencias_reais: Math.round(evidenceScore * 100),
      keywords_obrigatorias: Math.round(keywordsScore * 100),
      senioridade: Math.round(seniorityScore * 100),
      ferramentas_metodologias: Math.round(toolMethodScore * 100),
      riscos: Math.round(riskScore * 100)
    }
  };
}

function run(job) {
  try {
    const cv = JSON.parse(fs.readFileSync(CV_PATH, 'utf8'));
    return calculateStrictScore(cv, job);
  } catch {
    return { score: null, error: 'CV não encontrado' };
  }
}

function runWithCV(cvObj, job) {
  try {
    return calculateStrictScore(cvObj, job);
  } catch (e) {
    return { score: null, error: 'Erro ao calcular score do CV ajustado' };
  }
}

module.exports = { run, runWithCV, classifyJob, normalize, profileLevel, loadCareerProfile };
