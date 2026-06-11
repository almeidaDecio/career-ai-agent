const fs = require('fs');
const path = require('path');
const http = require('http');

const CV_PATH = path.join(__dirname, '..', 'sample_cv.json');
const OLLAMA_HOST = 'http://127.0.0.1:11434';
const OLLAMA_MODEL = 'job-analyzer';

function loadBaseCV() {
  const raw = fs.readFileSync(CV_PATH, 'utf8');
  return JSON.parse(raw);
}

function callOllama(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, format: 'json', options: { temperature: 0 } });
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

function extractJson(raw) {
  let cleaned = raw.trim();
  try { return JSON.parse(cleaned); } catch {}
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch {} }
  throw new Error('Não foi possível extrair JSON do Ollama');
}

function generate(cv, job) {
  const { matched, unmatched } = findMatches(cv, job);

  return {
    name: cv.name,
    current_title: cv.current_title,
    summary: cv.summary,
    skills_ordered: [...matched, ...unmatched],
    matched_skills: matched,
    experience: cv.experience,
    education: cv.education,
    languages: cv.languages
  };
}

function findSoftfocus(exp) {
  const lower = exp.company.toLowerCase();
  return lower.includes('softfocus') || lower.includes('soft focus');
}

async function generateForJob(job) {
  const cv = loadBaseCV();
  const base = generate(cv, job);

  // Build prompt for Ollama
  const softfocusExp = cv.experience.find(findSoftfocus);
  const softfocusText = softfocusExp ? `
Cargo: ${softfocusExp.role} (jul/2021 – fev/2026)
Resultados: O trabalho contribuiu diretamente para a conquista de 5 novos clientes, incluindo Santander e Banco do Brasil, além de viabilizar um crescimento de 10 vezes na volumetria processada pelos clientes.
Entregas originais:
- Entrega de mais de 50 novas telas para evolução da plataforma e otimização da experiência do usuário.
- Condução de 15+ entrevistas com usuários, apoiando pesquisas para novas funcionalidades e refinamento de fluxos existentes.
- Estruturação de 2 fluxos completos de produto: Comprovação Fiscal Analítica e Sensoriamento Remoto (análise baseada em imagens de satélite).
- Projetei interfaces no Figma para módulos críticos do produto, reduzindo fricção em jornadas-chave.
- Desenvolvi protótipos de alta fidelidade que antecipavam decisões e diminuíam retrabalho.
- Condução de testes de usabilidade e pesquisas qualitativas com usuários reais.
- Colaborei com PMs, desenvolvedores e QA em sprints ágeis.
- Documentação de user flows e contribuição para a evolução do design system.
- Integrei ferramentas de IA ao processo de design.
` : 'N/A';

  const prompt = `Você é um especialista em Recrutamento, Talent Acquisition e redator sênior de currículos focado em tecnologia.
Sua tarefa é reescrever APENAS duas seções do currículo do candidato (o "Resumo Profissional" e a experiência na "Softfocus") para otimizá-las para a vaga fornecida. O restante do currículo não deve ser alterado.
[DESCRITIVO DA VAGA]
${JSON.stringify(job, null, 2)}
[RESUMO PROFISSIONAL ORIGINAL]
${cv.summary}
[EXPERIÊNCIA SOFTFOCUS ORIGINAL]
${softfocusText}
[REGRAS E DIRETRIZES DE ESCRITA (CRÍTICO)]
1. COMPRIMENTO DO RESUMO: O resumo profissional deve ter de 2 a 3 parágrafos de texto corrido. Deve obrigatoriamente mencionar a trajetória de mais de 30 anos iniciada no design gráfico, destacando a precisão visual, e a transição bem-sucedida para o Product Design com foco em usabilidade e negócios.
2. NÃO faça "keyword stuffing" (não empilhe palavras-chave soltas).
3. PARALELISMO OBRIGATÓRIO NA SOFTFOCUS: Inicie TODOS os tópicos de atividades com substantivos de ação (ex: "Desenvolvimento...", "Condução...", "Estruturação...", "Colaboração...", "Concepção e projeto...", "Documentação..."). Nunca use verbos no infinitivo como "Conduzir".
4. Mantenha exatamente de 6 a 8 bullets na Softfocus, adaptando as atividades originais do candidato.
5. Mantenha as datas e dados quantitativos intactos.
6. A saída DEVE ser estritamente no formato JSON abaixo, sem qualquer texto introdutório ou explicativo:
{
  "resumo_ajustado": "Texto...",
  "softfocus_cargo": "Product Designer",
  "softfocus_periodo": "jul/2021 – fev/2026",
  "softfocus_resultados": "O trabalho...",
  "softfocus_entregas_ajustadas": [
    "bullet 1...",
    "bullet 2...",
    "bullet 3...",
    "bullet 4...",
    "bullet 5...",
    "bullet 6...",
    "bullet 7...",
    "bullet 8..."
  ]
}`;

  let ollamaResult = null;
  try {
    const raw = await callOllama(prompt);
    ollamaResult = extractJson(raw);
  } catch (e) {
    console.error('Ollama CV enhancement failed:', e.message);
  }

  // Merge Ollama result into final CV
  let finalSummary = base.summary;
  const finalExperience = base.experience.map(exp => ({ ...exp }));

  if (ollamaResult) {
    if (ollamaResult.resumo_ajustado) {
      finalSummary = ollamaResult.resumo_ajustado;
    }

    const sfIdx = finalExperience.findIndex(findSoftfocus);
    if (sfIdx !== -1) {
      if (ollamaResult.softfocus_entregas_ajustadas && Array.isArray(ollamaResult.softfocus_entregas_ajustadas)) {
        const entregas = ollamaResult.softfocus_entregas_ajustadas.filter(Boolean);
        if (entregas.length) {
          finalExperience[sfIdx].highlights = entregas;
        }
      }
      if (ollamaResult.softfocus_resultados) {
        finalExperience[sfIdx].resultados = ollamaResult.softfocus_resultados;
      }
    }
  }

  return {
    name: base.name,
    current_title: base.current_title,
    summary: finalSummary,
    skills_ordered: base.skills_ordered,
    matched_skills: base.matched_skills,
    experience: finalExperience,
    education: base.education,
    languages: base.languages
  };
}

function generateFromData(cvData, job) {
  const base = generate(cvData, job);
  return base;
}

function generateHTML(cv, ollamaResult) {
  const bullet = String.fromCharCode(8226);
  const skillsHTML = cv.skills_ordered.join(' ' + bullet + ' ');

  const bulletsHTML = (ollamaResult.softfocus_entregas_ajustadas || [])
    .map(bullet => `<li>${bullet}</li>`).join('\n        ');

  let template = fs.readFileSync(path.join(__dirname, 'cv_template.html'), 'utf8');

  let html = template
    .replace('{{resumo_ajustado}}', ollamaResult.resumo_ajustado || cv.summary)
    .replace('{{skills_list}}', skillsHTML)
    .replace('{{softfocus_periodo}}', ollamaResult.softfocus_periodo || '')
    .replace('{{softfocus_cargo}}', ollamaResult.softfocus_cargo || 'Product Designer')
    .replace('{{softfocus_resultados}}', ollamaResult.softfocus_resultados || '')
    .replace('{{softfocus_bullets}}', bulletsHTML);

  const publicDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  const outPath = path.join(publicDir, 'cv_otimizado.html');
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

module.exports = { generateForJob, generateFromData, generateHTML };
