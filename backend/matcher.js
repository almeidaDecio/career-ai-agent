const fs = require('fs');
const path = require('path');

const CV_PATH = path.join(__dirname, '..', 'sample_cv.json');

const synonyms = {
  'usability testing': 'testes usabilidade',
  'user research': 'pesquisa usuario',
  'ux research': 'pesquisa usuario',
  'user flows': 'fluxos usuario',
  'interaction design': 'design interacao',
  'prototyping': 'prototipacao',
  'ui design': 'design interface',
  'design systems': 'design system',
  'stakeholders': 'stakeholders',
  'nps': 'nps',
  'csat': 'csat',
  'lean inception': 'lean inception',
  'design thinking': 'design thinking',
  'design sprint': 'design sprint'
};

function normalize(s) {
  let r = String(s).toLowerCase();
  for (const [en, pt] of Object.entries(synonyms)) {
    r = r.replaceAll(en, pt);
  }
  return r
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCvTexts(cv) {
  const texts = [];
  if (cv.summary) texts.push(normalize(cv.summary));
  if (cv.categories) {
    for (const cat of Object.values(cv.categories)) {
      for (const skill of (cat.skills || [])) {
        texts.push(normalize(skill));
      }
      if (cat.evidence) texts.push(normalize(cat.evidence));
    }
  }
  if (cv.skills_ordered) {
    for (const s of cv.skills_ordered) texts.push(normalize(s));
  }
  if (cv.experience) {
    for (const exp of cv.experience) {
      if (exp.highlights) exp.highlights.forEach(h => texts.push(normalize(h)));
      if (exp.resultados) texts.push(normalize(exp.resultados));
      if (exp.skills) exp.skills.forEach(s => texts.push(normalize(s)));
    }
  }
  if (cv.education) {
    for (const edu of cv.education) {
      if (edu.degree) texts.push(normalize(edu.degree));
    }
  }
  if (cv.languages) {
    for (const lang of cv.languages) {
      texts.push(normalize(`${lang.language} ${lang.level}`));
    }
  }
  // Se for CV da Ollama (sem categories), complementa com o CV base para não perder matches
  if (!cv.categories) {
    try {
      const baseCv = JSON.parse(fs.readFileSync(CV_PATH, 'utf8').trim().replace(/^\uFEFF/, ''));
      if (baseCv.summary) texts.push(normalize(baseCv.summary));
      if (baseCv.categories) {
        for (const cat of Object.values(baseCv.categories)) {
          for (const skill of (cat.skills || [])) {
            texts.push(normalize(skill));
          }
          if (cat.evidence) texts.push(normalize(cat.evidence));
        }
      }
      if (baseCv.experience) {
        for (const exp of baseCv.experience) {
          if (exp.highlights) exp.highlights.forEach(h => texts.push(normalize(h)));
          if (exp.resultados) texts.push(normalize(exp.resultados));
          if (exp.skills) exp.skills.forEach(s => texts.push(normalize(s)));
        }
      }
    } catch {}
  }
  texts.push(texts.join(' '));
  return texts;
}

function hasSkill(skillName, cvTexts) {
  const ns = normalize(skillName);
  const words = ns.split(' ').filter(w => w.length > 3);
  for (const text of cvTexts) {
    if (text.includes(ns) || ns.includes(text)) return true;
    const textWords = text.split(' ').filter(w => w.length > 3);
    if (words.length > 0) {
      const matches = words.filter(w =>
        textWords.some(tw =>
          tw.includes(w) || w.includes(tw) ||
          (w.length >= 5 && tw.length >= 5 && (
            w.substring(0, 5) === tw.substring(0, 5) ||
            w.substring(0, Math.min(6, w.length, tw.length)) === tw.substring(0, Math.min(6, w.length, tw.length))
          ))
        )
      );
      if (matches.length / words.length >= 0.4) return true;
    }
  }
  return false;
}

function hasTool(toolName, cv) {
  const nt = normalize(toolName);
  const allSkills = [];
  if (cv.categories?.tools?.skills) allSkills.push(...cv.categories.tools.skills);
  if (cv.skills_ordered) allSkills.push(...cv.skills_ordered);
  if (cv.experience) {
    for (const exp of cv.experience) {
      if (exp.skills) allSkills.push(...exp.skills);
    }
  }
  for (const skill of allSkills) {
    const ns = normalize(skill);
    if (ns.includes(nt) || nt.includes(ns)) return true;
  }
  return false;
}

function run(job) {
  let cv;
  try { cv = JSON.parse(fs.readFileSync(CV_PATH, 'utf8')); }
  catch { return { score: null, error: 'CV não encontrado' }; }

  const cvTexts = buildCvTexts(cv);
  const required = job.required_skills || [];
  const nice = job.nice_to_have_skills || [];
  const tools = job.tools || [];
  const ats = job.ats_keywords || [];

  const matchedRequired = required.filter(s => hasSkill(s, cvTexts));
  const matchedNice = nice.filter(s => hasSkill(s, cvTexts));
  const matchedTools = tools.filter(s => hasTool(s, cv));
  const matchedAts = ats.filter(kw => hasSkill(kw, cvTexts));

  const totalRequired = required.length;
  const totalNice = nice.length;
  const totalTools = tools.length;

  const hasRequired = totalRequired > 0;
  const hasNice = totalNice > 0;
  const hasTools = totalTools > 0;
  const weightRequired = hasRequired ? 70 : 0;
  const weightNice     = hasNice     ? 20 : 0;
  const weightTools    = hasTools    ? 10 : 0;
  const totalWeight    = weightRequired + weightNice + weightTools || 100;

  const sr = hasRequired ? (matchedRequired.length / totalRequired) * weightRequired : 0;
  const sn = hasNice     ? (matchedNice.length     / totalNice)     * weightNice     : 0;
  const st = hasTools    ? (matchedTools.length     / totalTools)    * weightTools    : 0;

  const overall = Math.round(((sr + sn + st) / totalWeight) * 100);
  const atsScore = ats.length > 0 ? Math.round((matchedAts.length / ats.length) * 100) : 100;

  return {
    score: overall,
    atsScore,
    matchedRequired,
    matchedNice,
    matchedTools,
    matchedAts
  };
}

// Roda o match com um CV já gerado (objeto em memória, não o arquivo)
function runWithCV(cvObj, job) {
  try {
    const cvTexts = buildCvTexts(cvObj);
    const required = job.required_skills || [];
    const nice = job.nice_to_have_skills || [];
    const tools = job.tools || [];
    const ats = job.ats_keywords || [];

    const matchedRequired = required.filter(s => hasSkill(s, cvTexts));
    const matchedNice = nice.filter(s => hasSkill(s, cvTexts));
    const matchedTools = tools.filter(s => hasTool(s, cvObj));
    const matchedAts = ats.filter(kw => hasSkill(kw, cvTexts));

    const totalRequired = required.length;
    const totalNice = nice.length;
    const totalTools = tools.length;

    const hasRequired = totalRequired > 0;
    const hasNice = totalNice > 0;
    const hasTools = totalTools > 0;

    const weightRequired = hasRequired ? 70 : 0;
    const weightNice     = hasNice     ? 20 : 0;
    const weightTools    = hasTools    ? 10 : 0;
    const totalWeight    = weightRequired + weightNice + weightTools || 100;

    const sr = hasRequired ? (matchedRequired.length / totalRequired) * weightRequired : 0;
    const sn = hasNice     ? (matchedNice.length     / totalNice)     * weightNice     : 0;
    const st = hasTools    ? (matchedTools.length     / totalTools)    * weightTools    : 0;

    const overall = Math.round(((sr + sn + st) / totalWeight) * 100);
    const atsScore = ats.length > 0 ? Math.round((matchedAts.length / ats.length) * 100) : 100;

    return { score: overall, atsScore, matchedRequired, matchedNice, matchedTools, matchedAts };
  } catch {
    return { score: null, error: 'Erro ao calcular score do CV ajustado' };
  }
}

module.exports = { run, runWithCV };
