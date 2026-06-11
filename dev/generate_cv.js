const fs = require('fs');
const path = require('path');

const CV_PATH = path.join(__dirname, '..', 'sample_cv.json');

// Carrega o CV base
function loadBaseCV() {
  const raw = fs.readFileSync(CV_PATH, 'utf8');
  return JSON.parse(raw);
}

// Skills que batem com a vaga
function findMatches(cv, job) {
  const allJobSkills = [
    ...(job.required_skills || []),
    ...(job.nice_to_have_skills || []),
    ...(job.tools || [])
  ].map(s => s.toLowerCase());

  const matched = [];
  const unmatched = [];

  for (const cat of Object.values(cv.categories)) {
    for (const skill of (cat.skills || [])) {
      const lower = skill.toLowerCase();
      const isMatch = allJobSkills.some(js =>
        lower.includes(js) || js.includes(lower)
      );
      (isMatch ? matched : unmatched).push(skill);
    }
  }

  return { matched, unmatched };
}

// Gera CV otimizado
function generate(cv, job) {
  const { matched, unmatched } = findMatches(cv, job);

  // Summary com ATS keywords
  const atsKeywords = (job.ats_keywords || []).slice(0, 5).join(', ');
  let summary = cv.summary;
  if (atsKeywords) {
    summary += ` Domínio em ${atsKeywords}.`;
  }

  // Skills: matching primeiro
  const orderedSkills = [...matched, ...unmatched];

  // Monta o CV otimizado
  return {
    name: cv.name,
    current_title: cv.current_title,
    summary,
    skills: orderedSkills,
    matched_skills: matched,
    experience: cv.experience,
    education: cv.education,
    languages: cv.languages
  };
}

// --- testes ---
const cv = loadBaseCV();
const job = {
  required_skills: ['React', 'Node.js', 'TypeScript'],
  nice_to_have_skills: ['acessibilidade', 'Design Thinking'],
  tools: ['Figma'],
  ats_keywords: ['Product Design', 'Design System', 'Mobile', 'Figma', 'B2B SaaS']
};

const result = generate(cv, job);

console.log('=== CV Otimizado ===\n');
console.log('Nome:', result.name);
console.log('Título:', result.current_title);
console.log('\nSummary:', result.summary);
console.log('\nSkills em ordem:');
result.skills.forEach((s, i) => {
  const tag = result.matched_skills.includes(s) ? ' [MATCH]' : '';
  console.log(`  ${i + 1}. ${s}${tag}`);
});
