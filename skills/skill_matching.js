const fs = require('fs');

const job = JSON.parse(fs.readFileSync('sample_job.json', 'utf8'));
const cv = JSON.parse(fs.readFileSync('sample_cv.json', 'utf8'));

// Normaliza string: lowercase, sem acentos, sem espaços extras
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
  let r = s.toLowerCase();
  for (const [en, pt] of Object.entries(synonyms)) {
    r = r.replaceAll(en, pt);
  }
  return r
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Coleta todo texto do CV (skills + evidencias + education + languages) para busca
function buildCvText() {
  const texts = [];
  if (cv.summary) texts.push(normalize(cv.summary));
  for (const cat of Object.values(cv.categories)) {
    for (const skill of cat.skills) {
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

const cvTexts = buildCvText();

// Verifica se o candidato tem a skill via correspondência textual
function hasSkill(skillName) {
  const ns = normalize(skillName);
  const words = ns.split(' ').filter(w => w.length > 3);

  for (const text of cvTexts) {
    if (text.includes(ns) || ns.includes(text)) return true;
    // Match por palavras-chave: pelo menos 35% das palavras longas batem
    const textWords = text.split(' ').filter(w => w.length > 3);
    if (words.length > 0) {
      const matches = words.filter(w =>
        textWords.some(tw =>
          tw.includes(w) || w.includes(tw) ||
          // Stemming básico: compartilha prefixo >= 5 chars
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

// Verifica se a tool está presente
function hasTool(toolName) {
  const nt = normalize(toolName);
  for (const skill of cv.categories.tools.skills) {
    const ns = normalize(skill);
    if (ns.includes(nt) || nt.includes(ns)) return true;
  }
  return false;
}

function calculateScore(matchedRequired, matchedNice, matchedTools, job) {
  const totalRequired = job.required_skills.length;
  const totalNice = job.nice_to_have_skills.length;
  const totalTools = job.tools.length;

  const sr = totalRequired > 0 ? (matchedRequired.length / totalRequired) * 70 : 70;
  const sn = totalNice > 0 ? (matchedNice.length / totalNice) * 20 : 20;
  const st = totalTools > 0 ? (matchedTools.length / totalTools) * 10 : 10;

  return { overall: Math.round(sr + sn + st), requiredPts: sr, nicePts: sn, toolsPts: st };
}

async function main() {
  console.log('Analisando skills por correspondência textual...\n');

  const matchedRequired = [];
  const missingRequired = [];
  for (const skill of job.required_skills) {
    const match = hasSkill(skill);
    console.log(`  [${match ? 'OK' : '  '}] ${skill}`);
    if (match) matchedRequired.push(skill);
    else missingRequired.push(skill);
  }

  const matchedNice = [];
  for (const skill of job.nice_to_have_skills) {
    const match = hasSkill(skill);
    console.log(`  [${match ? 'OK' : '  '}] (nice) ${skill}`);
    if (match) matchedNice.push(skill);
  }

  const matchedTools = [];
  for (const tool of job.tools) {
    const match = hasTool(tool);
    console.log(`  [${match ? 'OK' : '  '}] (tool) ${tool}`);
    if (match) matchedTools.push(tool);
  }

  // Análise ATS
  console.log('\n  --- ATS Keywords ---');
  const matchedAts = [];
  const missingAts = [];
  for (const kw of (job.ats_keywords || [])) {
    const match = cvTexts.some(t => {
      const nkw = normalize(kw);
      return t.includes(nkw) || nkw.includes(t);
    }) || hasSkill(kw);
    console.log(`  [${match ? 'OK' : '  '}] ${kw}`);
    if (match) matchedAts.push(kw);
    else missingAts.push(kw);
  }
  const atsScore = (job.ats_keywords || []).length > 0
    ? Math.round((matchedAts.length / job.ats_keywords.length) * 100)
    : 100;

  // Narrativas (via JS, sem depender do Ollama)
  const strengths = matchedRequired.length > 0
    ? [`Domina ${matchedRequired.slice(0, 3).join(', ')}`, 'Experiência em ciclo completo de design', 'Atuação em produtos B2B SaaS']
    : [];

  const gaps = missingRequired.length > 0
    ? missingRequired.slice(0, 2).map(s => `Não possui: ${s}`)
    : [];

  const score = calculateScore(matchedRequired, matchedNice, matchedTools, job);

  console.log('\n=== MATCH RESULT ===\n');
  console.log('Matched Required:', matchedRequired);
  console.log('Missing Required:', missingRequired);
  console.log('Matched Nice-to-have:', matchedNice);
  console.log('Matched Tools:', matchedTools);
  console.log('\nStrengths:');
  strengths.forEach(s => console.log(`  + ${s}`));
  console.log('\nGaps:');
  gaps.forEach(g => console.log(`  - ${g}`));
  console.log(`\n=== SCORE: ${score.overall}/100 ===`);
  console.log(`  Required (70%): ${score.requiredPts.toFixed(1)} (${matchedRequired.length}/${job.required_skills.length})`);
  console.log(`  Nice-to-have (20%): ${score.nicePts.toFixed(1)} (${matchedNice.length}/${job.nice_to_have_skills.length})`);
  console.log(`  Tools (10%): ${score.toolsPts.toFixed(1)} (${matchedTools.length}/${job.tools.length})`);
  console.log(`  ATS Keywords: ${atsScore}% (${matchedAts.length}/${(job.ats_keywords || []).length})`);

  fs.writeFileSync('matching_result.json', JSON.stringify({
    score: score.overall, atsScore, matchedRequired, missingRequired, matchedNice, matchedTools, matchedAts, missingAts, strengths, gaps
  }, null, 2));
  console.log('\nResultado salvo em matching_result.json');
}

main().catch(console.error);
