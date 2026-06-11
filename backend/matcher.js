const fs = require('fs');
const path = require('path');

const CV_PATH = path.join(__dirname, '..', 'sample_cv.json');

const synonyms = {
  'usability testing': 'testes usabilidade',
  'user research': 'pesquisa usuario',
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
  for (const cat of Object.values(cv.categories)) {
    for (const skill of (cat.skills || [])) {
      texts.push(normalize(skill));
    }
    if (cat.evidence) texts.push(normalize(cat.evidence));
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
  for (const skill of (cv.categories.tools.skills || [])) {
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

  const sr = totalRequired > 0 ? (matchedRequired.length / totalRequired) * 70 : 70;
  const sn = totalNice > 0 ? (matchedNice.length / totalNice) * 20 : 20;
  const st = totalTools > 0 ? (matchedTools.length / totalTools) * 10 : 10;

  const overall = Math.round(sr + sn + st);
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

module.exports = { run };
