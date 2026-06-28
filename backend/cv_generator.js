const fs = require('fs');
const path = require('path');
const http = require('http');

const DICT_PATH = path.join(__dirname, '..', 'dicionario_subprodutos.json');
let dictionary = null;
function loadDict() {
  if (dictionary) return dictionary;
  try { dictionary = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8')); }
  catch { dictionary = {}; }
  return dictionary;
}

const CV_PATH = path.join(__dirname, '..', 'sample_cv.json');
const OLLAMA_HOST = 'http://127.0.0.1:11434';
const OLLAMA_MODEL = 'llama3.2:3b';

function replaceEngineering(text) {
  return text
    .replace(/\bEngenharia de Software\b/gi, 'Desenvolvimento de Software')
    .replace(/\bEngenharia\b/gi, 'Desenvolvimento')
    .replace(/\bengenharia\b/g, 'desenvolvimento');
}

// ── Métricas fixas — nunca podem ser removidas ou parafraseadas ──────────
function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const FIXED_METRICS = [
  'Mais de 50 novas telas entregues para evolução da plataforma no Figma',
  '15+ entrevistas com usuários conduzidas para novas funcionalidades e refinamento de fluxos existentes',
];

// Checks por regex — detectam variações de escrita do Ollama
const METRICS_CHECKS = [
  b => /50 nov|cinquenta/i.test(b),
  b => /15\+|quinze|15 entrev/i.test(b),
];

// Verifica se um bullet duplica uma métrica fixa
function isDuplicateOfFixed(bullet) {
  return METRICS_CHECKS.some(check => check(bullet));
}

// Garante que todas as métricas fixas estão presentes — reinjeta só as ausentes
function ensureFixedMetrics(entregas) {
  let result = Array.isArray(entregas) ? [...entregas] : [];
  const missingIndexes = [];
  METRICS_CHECKS.forEach((check, i) => {
    const found = result.some(b => check(b));
    if (!found) missingIndexes.push(i);
  });
  const toInject = missingIndexes.map(i => FIXED_METRICS[i]);
  return [...toInject, ...result];
}

// ── Detecta redundância entre bullets (word overlap ≥ threshold) ────
function normalizeWord(w) {
  return w.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function significantWords(text) {
  return text.split(/\s+/).filter(w => w.length > 3).map(normalizeWord);
}

function wordOverlapRatio(a, b) {
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (!wa.length || !wb.length) return 0;
  const matches = wa.filter(w => wb.some(x => w.includes(x) || x.includes(w)));
  return matches.length / Math.max(wa.length, wb.length);
}

function removeRedundantBullets(bullets, threshold = 0.4) {
  const result = [];
  for (const b of bullets) {
    const redundant = result.some(existing => wordOverlapRatio(b, existing) >= threshold);
    if (!redundant) result.push(b);
  }
  return result;
}

// Remove paráfrases de métricas fixas (ex: "Conduzi entrevistas..." sem "15+")
function removeFixedParaphrases(bullets) {
  return bullets.filter(b => {
    if (/(?:entrevistas?\s+com\s+usu[aá]rios)/i.test(b) && !/(?:15\+|quinze)/i.test(b)) return false;
    return true;
  });
}

// Remove bullets que compartilham o mesmo grupo de conceito
const CONCEPT_GROUPS = [
  ['figma', 'prototip', 'interfac', 'mockup', 'wirefram', 'fidelidade'],
  ['flux', 'jornada'],
];
function removeConceptDuplicates(bullets) {
  const result = [];
  const usedGroups = new Set();
  for (const b of bullets) {
    const lower = b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matchedGroups = CONCEPT_GROUPS
      .map((group, i) => group.some(k => lower.includes(k)) ? i : -1)
      .filter(i => i !== -1);
    if (matchedGroups.length === 0 || matchedGroups.some(g => !usedGroups.has(g))) {
      matchedGroups.forEach(g => usedGroups.add(g));
      result.push(b);
    }
  }
  return result;
}
// ─────────────────────────────────────────────────────────────────────

// ── Título dinâmico do cabeçalho — baseado no job_title da vaga ────────
// Lista de títulos do candidato vem do current_title do CV base
// (ex: "Product Designer | UX Designer | UI Designer").
function candidateTitlesFromCV(cv) {
  const raw = (cv && cv.current_title) || 'Product Designer';
  return raw.split('|').map(t => t.trim()).filter(Boolean);
}

// Considera o job_title genérico demais pra usar sozinho (ex: só "Designer")
function isGenericTitle(title) {
  if (!title) return true;
  const t = title.trim();
  if (t.length < 5) return true;
  const genericOnly = /^designer$|^design(er)?\s+ux\/?ui$/i;
  return genericOnly.test(t);
}

// Escolhe o título de cabeçalho: usa o job_title extraído da vaga se for
// específico o bastante; caso contrário, escolhe o título do candidato
// mais próximo do contexto da vaga (skills + responsabilidades); se nada
// bater bem, cai pro primeiro título da lista do candidato.
function pickHeaderTitle(job, candidateTitles) {
  const jobTitle = job && job.job_title ? String(job.job_title).trim() : '';
  if (jobTitle && !isGenericTitle(jobTitle)) {
    return jobTitle;
  }

  const jobContext = [
    jobTitle,
    ...(job?.required_skills || []),
    ...(job?.responsibilities || [])
  ].join(' ');

  if (jobContext.trim()) {
    let best = null;
    let bestScore = 0;
    for (const title of candidateTitles) {
      const score = wordOverlapRatio(title, jobContext);
      if (score > bestScore) {
        bestScore = score;
        best = title;
      }
    }
    if (best && bestScore > 0) return best;
  }

  return candidateTitles[0] || 'Product Designer';
}
// ─────────────────────────────────────────────────────────────────────


const SYN_PATH = path.join(__dirname, '..', 'sinonimos_pt_en.json');
let synonyms = null;
function loadSynonyms() {
  if (synonyms) return synonyms;
  try { synonyms = JSON.parse(fs.readFileSync(SYN_PATH, 'utf8')); }
  catch { synonyms = {}; }
  return synonyms;
}

function normalizeSkill(s) {
  let lower = s.toLowerCase().trim();
  const dict = loadSynonyms();
  for (const [pt, en] of Object.entries(dict)) {
    if (lower === pt) return en;
  }
  return lower;
}

function sanitizeSkills(skills) {
  const seen = new Set();
  return skills.filter(s => {
    const key = normalizeSkill(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadBaseCV() {
  const raw = fs.readFileSync(CV_PATH, 'utf8');
  return JSON.parse(raw);
}

function callOllama(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, format: 'json', options: { temperature: 0.4 } });
    const req = http.request(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      timeout: 300000
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body).response); }
        catch (e) { reject(new Error('Falha ao ler resposta do Ollama')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout Ollama')); });
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
  const headerTitle = pickHeaderTitle(job, candidateTitlesFromCV(cv));

  return {
    name: cv.name,
    current_title: cv.current_title,
    header_title: headerTitle,
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

  const prompt = `[VAGA]
${JSON.stringify(job, null, 2)}

[RESUMO ATUAL DO CANDIDATO]
${cv.summary}

[EXPERIÊNCIA SOFTFOCUS ORIGINAL]
${softfocusText}

---

### Instrução principal

Você é um editor técnico de currículos especializado em Product Design, UX, UI e produtos digitais B2B.

Sua tarefa NÃO é criar um currículo novo.

Sua tarefa é adaptar o resumo profissional e os bullets dinâmicos da experiência Softfocus usando apenas informações já existentes no CV base, priorizando os pontos mais aderentes à vaga.

Você pode reorganizar, condensar, ajustar verbos e aproximar a linguagem da vaga.

Você não pode inventar experiências, ferramentas, resultados, métricas, cargos, empresas, clientes, projetos ou competências.

---

### Importante: métricas e resultados fixos

A experiência Softfocus possui elementos fixos que não devem ser gerados pela IA.

Estes dois bullets já são inseridos automaticamente pelo sistema em softfocus_metrics:

* "Mais de 50 novas telas entregues para evolução da plataforma no Figma"
* "15+ entrevistas com usuários conduzidas para novas funcionalidades e refinamento de fluxos existentes"

Além disso, o box de resultados da Softfocus já é inserido separadamente no currículo:

"O trabalho contribuiu diretamente para a conquista de 5 novos clientes, incluindo Santander e Banco do Brasil, além de viabilizar um crescimento de 10 vezes na volumetria processada pelos clientes."

Portanto, a IA NÃO deve repetir nos bullets dinâmicos:

* Mais de 50 novas telas
* 15+ entrevistas
* 5 novos clientes
* Santander
* Banco do Brasil
* crescimento de 10 vezes / 10x na volumetria

Essas informações podem ser consideradas como contexto, mas não devem ser reescritas nem duplicadas na saída dinâmica.

---

### Regras para o Resumo Profissional

Gerar exatamente 2 parágrafos curtos.

Cada parágrafo deve ter entre 2 e 3 frases.

O resumo deve ser escrito em **primeira pessoa do singular**, utilizando linguagem profissional, natural e objetiva.

Não mencionar a vaga, a empresa contratante ou o processo seletivo.

Não escrever frases de intenção, motivação ou desejo profissional.

Evitar frases como:

* "Busco novos desafios"
* "Estou apaixonado por"
* "Tenho interesse em"
* "Minha trajetória é relevante para esta oportunidade"
* "Sou o candidato ideal"
* "Como se eu estivesse explicando"

O resumo deve apenas apresentar minha trajetória, competências e evidências profissionais.

---

### Estrutura obrigatória do resumo

Parágrafo 1:

* Cargo/área de atuação
* Tempo de experiência
* Transição do design gráfico tradicional para produtos digitais
* Principais áreas de atuação relacionadas à vaga

Parágrafo 2:

* Forma como desenvolvo meu trabalho em produto
* Competências aderentes à vaga com evidência no CV
* Impacto profissional comprovado, sem repetir métricas fixas
* Ferramentas ou práticas apenas quando existirem no CV base

---

### Regras de estilo

Usar linguagem natural, objetiva e profissional.

Priorizar fatos verificáveis em vez de adjetivos.

Preferir construções como:

* "conduzo entrevistas com usuários"
* "estruturo fluxos de produto"
* "crio telas e protótipos no Figma"
* "colaboro com PMs, desenvolvedores e QA"
* "tenho experiência na evolução de produtos B2B do setor financeiro"

Evitar:

* "profissional diferenciado"
* "alta performance"
* "apaixonado por inovação"
* "resultados excepcionais"
* "perfil estratégico e criativo"
* "soluções transformadoras"

---

### Regras para a experiência Softfocus

Reescrever apenas os bullets dinâmicos da experiência Softfocus.

Não gerar os dois bullets fixos de métricas.

Não gerar o box de resultados com Santander, Banco do Brasil, 5 novos clientes ou crescimento de 10 vezes.

Gerar entre 4 e 6 bullets dinâmicos.

Cada bullet deve seguir esta estrutura:

verbo no passado + ação realizada + contexto/ferramenta + finalidade ou impacto qualitativo

Todos os bullets devem estar no passado.

Cada bullet deve demonstrar aderência a pelo menos um requisito da vaga.

Não repetir a mesma ideia em bullets diferentes.

Não inventar métricas.

Não alterar números, datas, clientes ou resultados existentes.

---

### Conteúdos permitidos para os bullets dinâmicos

A IA pode usar e reescrever apenas evidências como:

* Estruturação de 2 fluxos completos de produto
* Comprovação Fiscal Analítica
* Sensoriamento Remoto
* Testes de usabilidade
* Pesquisas qualitativas
* Usuários reais
* Colaboração com PMs, desenvolvedores e QA
* Sprints ágeis
* Documentação de user flows
* Evolução do design system
* Integração de ferramentas de IA ao fluxo de design
* Ideação, pesquisa e variações com apoio de IA
* Prototipação de alta fidelidade no Figma
* Redução de retrabalho em sprint, quando essa informação existir no CV base

---

### Priorização dos bullets dinâmicos

Ao adaptar os bullets, priorizar evidências relacionadas a:

1. Product Design
2. Discovery
3. Validação com usuários
4. Figma
5. Prototipação
6. User flows
7. Design system
8. Colaboração com PMs, desenvolvedores e QA
9. Produtos B2B, sistemas complexos e setor financeiro
10. IA aplicada ao design

Usar termos da vaga somente quando houver evidência correspondente no CV base.

Se a vaga pedir uma competência que não existe no CV base, não mencionar essa competência.

---

### Exemplo de bom resumo

Tenho mais de 30 anos de experiência em design, com trajetória iniciada no design gráfico tradicional e evolução para produtos digitais. Desenvolvo interfaces, fluxos, protótipos e experiências orientadas à clareza operacional, usabilidade e consistência visual.

Tenho experiência em produtos B2B do setor financeiro, conduzindo discovery, validação com usuários, prototipação em Figma e colaborando com times de produto, desenvolvimento e QA. Contribuo para a evolução de plataformas digitais complexas, conectando necessidades de negócio, viabilidade técnica e experiência do usuário.

---

### Exemplo de texto proibido

"Sou apaixonado por resolver problemas complexos e busco novas oportunidades para aplicar meus conhecimentos. Minha trajetória mostra por que sou ideal para essa oportunidade específica, unindo inovação, alta performance e soluções transformadoras."

---

### Validação antes da resposta

Antes de retornar o JSON, verificar internamente:

* O resumo tem exatamente 2 parágrafos?
* O resumo está escrito em primeira pessoa?
* O texto não menciona a vaga ou a empresa?
* Não há frases de intenção profissional?
* Não há adjetivos genéricos?
* O resumo não repete métricas fixas?
* Todos os bullets dinâmicos estão no passado?
* Nenhum bullet dinâmico repete os bullets fixos?
* Nenhum bullet dinâmico repete Santander, Banco do Brasil, 5 novos clientes ou crescimento de 10 vezes?
* Nenhuma competência foi inventada?
* O JSON está válido?

### Formato de saída

Retorne APENAS o JSON abaixo, sem texto adicional:

{
  "resumo_ajustado": "Parágrafo 1...\\n\\nParágrafo 2...",
  "softfocus_cargo": "Product Designer",
  "softfocus_periodo": "jul/2021 – fev/2026",
  "softfocus_resultados": "O trabalho contribuiu diretamente para a conquista de 5 novos clientes, incluindo Santander e Banco do Brasil, além de viabilizar um crescimento de 10 vezes na volumetria processada pelos clientes.",
  "softfocus_entregas_ajustadas": [
    "bullet 1...",
    "bullet 2...",
    "bullet 3...",
    "bullet 4...",
    "bullet 5...",
    "bullet 6..."
  ]
}`;

  let ollamaResult = null;
  try {
    const sanitizedPrompt = replaceEngineering(prompt);
    const raw = await callOllama(sanitizedPrompt);
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
      // Fallback: se o Ollama devolveu resumo muito curto, usa o original
      const palavras = finalSummary.split(/\s+/).filter(Boolean).length;
      if (palavras < 50) {
        finalSummary = base.summary;
      }
    }

    // Remove bloco de resultados do resumo (evita duplicar com campo softfocus_resultados)
    finalSummary = finalSummary.replace(/, incluindo Santander e Banco do Brasil/i, '');
    finalSummary = finalSummary.replace(/[,\s]*Santander e Banco do Brasil[,\s]*/i, '');
    finalSummary = finalSummary.replace(/\bincluindo Santander\b.*?(?:\.|$)/i, 'no setor financeiro.');
    finalSummary = finalSummary.replace(/(?:contribui[çc][ãa]o|contribuiu)[^.]*5 novos clientes[^.]*\./gi, '');
    finalSummary = finalSummary.replace(/\b5 novos clientes\b.*?(?:\.|,|$)/i, '');
    finalSummary = finalSummary.replace(/[Oo] trabalho contribuiu diretamente[^.]*5 novos clientes[^.]*\./gi, '');
    finalSummary = finalSummary.replace(/[Oo] trabalho contribuiu[^.]*volumetria processada[^.]*\./gi, '');

    const sfIdx = finalExperience.findIndex(findSoftfocus);
    if (sfIdx !== -1) {
      if (ollamaResult.softfocus_entregas_ajustadas && Array.isArray(ollamaResult.softfocus_entregas_ajustadas)) {
        // Remove bullets que duplicam métricas fixas, depois reinjeta as ausentes
        const semDuplicatas = ollamaResult.softfocus_entregas_ajustadas
          .filter(Boolean)
          .filter(b => !isDuplicateOfFixed(b));
        const entregas = ensureFixedMetrics(semDuplicatas);
        if (entregas.length) {
          finalExperience[sfIdx].highlights = entregas;
          ollamaResult.softfocus_entregas_ajustadas = entregas;
        }
      }

      // Validar softfocus_resultados — garantir que não ficou vazio nem perdeu dados
      const DEFAULT_RESULTADOS = 'O trabalho contribuiu diretamente para a conquista de 5 novos clientes, incluindo Santander e Banco do Brasil, além de viabilizar um crescimento de 10 vezes na volumetria processada pelos clientes.';
      if (!ollamaResult.softfocus_resultados || !ollamaResult.softfocus_resultados.trim()) {
        ollamaResult.softfocus_resultados = DEFAULT_RESULTADOS;
      } else {
        const res = ollamaResult.softfocus_resultados;
        const temNumeros =
          /5 novos|santander|banco do brasil/i.test(res) &&
          /10x|10 vez/i.test(res);
        if (!temNumeros) {
          ollamaResult.softfocus_resultados = DEFAULT_RESULTADOS;
        }
      }
      finalExperience[sfIdx].resultados = ollamaResult.softfocus_resultados;
    }

    // Validação leve de aderência — não modifica o texto, apenas sinaliza
    const jobText = JSON.stringify(job).toLowerCase();
    const cvText = JSON.stringify(cv).toLowerCase();
    const resumoLower = finalSummary.toLowerCase();
    const conceptChecks = [
      { name: 'discovery', keywords: ['discovery', 'descoberta'] },
      { name: 'delivery', keywords: ['delivery', 'entrega contínua'] },
      { name: 'figma', keywords: ['figma'] },
      { name: 'prototipação', keywords: ['prototip', 'prototyping'] },
      { name: 'ux research', keywords: ['ux research', 'pesquisa com usuários'] },
      { name: 'testes de usabilidade', keywords: ['testes de usabilidade', 'usability testing'] },
      { name: 'entrevistas com usuários', keywords: ['entrevistas com usuários', 'entrevistas com usuários reais'] },
      { name: 'design system', keywords: ['design system'] },
      { name: 'user flows', keywords: ['user flows', 'fluxos de produto'] },
      { name: 'b2b', keywords: ['b2b', 'saas'] },
      { name: 'setor financeiro', keywords: ['financeiro', 'santander'] },
      { name: 'ia aplicada ao design', keywords: ['ia', 'inteligência artificial'] },
    ];
    const fixedElements = ['50 novas telas', '15+ entrevistas', '5 novos clientes', 'santander', 'banco do brasil', '10 vezes', '10x'];
    const repeteFixos = fixedElements.some(f => resumoLower.includes(f));
    if (repeteFixos) {
      console.log('[CV Generator] Aderência: resumo repete elementos fixos que deveriam estar apenas na seção de resultados');
    }
    for (const c of conceptChecks) {
      const naVaga = c.keywords.some(k => jobText.includes(k));
      const noCV = c.keywords.some(k => cvText.includes(k));
      const noResumo = c.keywords.some(k => resumoLower.includes(k));
      if (naVaga && noCV && !noResumo) {
        console.log(`[CV Generator] Aderência: vaga pede "${c.name}" (presente no CV) mas o resumo gerado não o menciona`);
      }
    }
  }

  // Sanitização extra: garante que mesmo sem Ollama (falha total) o resumo não leva métricas fixas
  finalSummary = finalSummary.replace(/, incluindo Santander e Banco do Brasil/i, '');
  finalSummary = finalSummary.replace(/[,\s]*Santander e Banco do Brasil[,\s]*/i, '');
  finalSummary = finalSummary.replace(/(?:contribui[çc][ãa]o|contribuiu)[^.]*5 novos clientes[^.]*\./gi, '');
  finalSummary = finalSummary.replace(/\b5 novos clientes\b.*?(?:\.|,|$)/i, '');
  finalSummary = finalSummary.replace(/[Oo] trabalho contribuiu diretamente[^.]*5 novos clientes[^.]*\./gi, '');
  finalSummary = finalSummary.replace(/[Oo] trabalho contribuiu[^.]*volumetria processada[^.]*\./gi, '');

  // Pós-processamento: limpar padrões fracos que o Ollama eventualmente ainda gere
  if (ollamaResult?.softfocus_entregas_ajustadas) {
    ollamaResult.softfocus_entregas_ajustadas = ollamaResult.softfocus_entregas_ajustadas
      .map(b => {
        if (!b) return b;
        let t = b;
        // Substituir "responsável por" -> verbo forte genérico
        t = t.replace(/\bRespons[áa]vel por\b/i, 'Estruturei e executei');
        t = t.replace(/\bApoio[uo]? (em|na|no|nas|nos)\b/i, 'Colaborei em');
        t = t.replace(/\bParticipa[cç][ãa]o (em|na|no|nas|nos)\b/i, 'Contribuí em');
        t = t.replace(/\bAtu[oi] (com|em|na|no|nas|nos)\b/i, 'Trabalhei em');
        t = t.replace(/\bEra respons[áa]vel por\b/i, 'Estruturei');
        t = t.replace(/\bAtuava\b/i, 'Atuei');
        t = t.replace(/^Documentação de\b/i, 'Contribuí na documentação de');
        t = t.replace(/\be contribuição para (a|o|as|os)\b/i, ' e na');
        t = t.replace(/^Estrutura[cç][ãa]o de\b/i, 'Estruturei');
        t = t.replace(/^Estruturada?\b/i, 'Estruturei');
        t = t.replace(/^Desenvolvimento de\b/i, 'Desenvolvi');
        t = t.replace(/^Desenvolvido\b/i, 'Desenvolvi');
        t = t.replace(/^Condu[cç][ãa]o de\b/i, 'Conduzi');
        t = t.replace(/^Cria[cç][ãa]o de\b/i, 'Criei');
        t = t.replace(/^Colabora[cç][ãa]o (com|em)\b/i, 'Colaborei $1');
        // Remover adjetivos genéricos isolados
        t = t.replace(/\b(alta performance|fora da curva|acima da m[ée]dia|excepcional|diferenciado|refer[êe]ncia|vision[áa]rio|completo|multifuncional|proativo|resiliente|focado em resultados?|apaixonado)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
        return t;
      })
      .filter(Boolean)
      .filter(b => b.length > 10)
      .filter(b => !isDuplicateOfFixed(b))
      .filter(b => removeFixedParaphrases([b]).length > 0)
      // Remover bullets que contenham texto de resultados fixos
      .filter(b => !/(5 novos clientes|santander|banco do brasil|crescimento de 10|10 vezes|10x na volumetria)/i.test(b));

    // Remove bullets redundantes (≥40% de sobreposição de palavras significativas)
    ollamaResult.softfocus_entregas_ajustadas = removeRedundantBullets(
      ollamaResult.softfocus_entregas_ajustadas,
      0.4
    );

    // Remove conceitos duplicados — só entre bullets NÃO fixos
    const dynamicBullets = ollamaResult.softfocus_entregas_ajustadas
      .filter(b => !isDuplicateOfFixed(b));
    const deduped = removeConceptDuplicates(dynamicBullets);
    const fixed = ollamaResult.softfocus_entregas_ajustadas
      .filter(b => isDuplicateOfFixed(b));
    ollamaResult.softfocus_entregas_ajustadas = [...fixed, ...deduped];

    // Propagar de volta pro objeto de experiência
    const _sfIdx = finalExperience.findIndex(findSoftfocus);
    if (_sfIdx !== -1) {
      finalExperience[_sfIdx].highlights = ollamaResult.softfocus_entregas_ajustadas;
    }
  }

  // Sanitização de fallback: garante que mesmo sem Ollama os dados da Softfocus não são perdidos
  const _fallbackSfIdx = finalExperience.findIndex(findSoftfocus);
  if (_fallbackSfIdx !== -1) {
    if (finalExperience[_fallbackSfIdx].highlights) {
      finalExperience[_fallbackSfIdx].highlights = finalExperience[_fallbackSfIdx].highlights
        .filter(b => !/(5 novos clientes|santander|banco do brasil|crescimento de 10|10 vezes|10x na volumetria)/i.test(b));
    }
    if (!finalExperience[_fallbackSfIdx].resultados) {
      finalExperience[_fallbackSfIdx].resultados = 'O trabalho contribuiu diretamente para a conquista de 5 novos clientes, incluindo Santander e Banco do Brasil, além de viabilizar um crescimento de 10 vezes na volumetria processada pelos clientes.';
    }
  }

  const dict = loadDict();
  const allSubSkills = new Set();
  for (const subs of Object.values(dict)) {
    subs.forEach(s => allSubSkills.add(s.toLowerCase().trim()));
  }
  const enrichedSkills = [...base.skills_ordered];
  const existingLower = new Set(enrichedSkills.map(s => s.toLowerCase().trim()));
  const dictJobSkills = [
    ...(job.required_skills || []),
    ...(job.tools || [])
  ];
  for (const js of dictJobSkills) {
    const lower = js.toLowerCase().trim();
    if (allSubSkills.has(lower) && !existingLower.has(lower)) {
      enrichedSkills.push(capitalizeSkill(js));
      existingLower.add(lower);
    }
  }

  return {
    name: base.name,
    current_title: base.current_title,
    header_title: base.header_title,
    summary: finalSummary,
    skills_ordered: enrichedSkills,
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

function computeHeaderTitle(cv, job) {
  return pickHeaderTitle(job, candidateTitlesFromCV(cv));
}

function capitalizeSkill(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function generateHTML(cv, ollamaResult) {
  cv.skills_ordered = sanitizeSkills([...cv.skills_ordered]);
  const skillsHTML = cv.skills_ordered.map(capitalizeSkill).join(' | ');

  const cleanBullet = s => s
    .replace(/^[\s•\-–\*]+/, '')
    .replace(/[\s•\-–\*]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const entregas = ollamaResult.softfocus_entregas_ajustadas || [];
  const fixedMetricsHTML = FIXED_METRICS
    .map(m => `<li>${cleanBullet(m)}</li>`).join('\n        ');

  const dynamicBulletsHTML = entregas
    .filter(e => !FIXED_METRICS.includes(e))
    .filter(e => !isDuplicateOfFixed(e))
    .map(m => `<li>${cleanBullet(m)}</li>`)
    .filter(html => html.length > 10)
    .join('\n        ');

  let template = fs.readFileSync(path.join(__dirname, 'cv_template.html'), 'utf8');

  let html = template
    .replace('{{header_title}}', cv.header_title || cv.current_title || 'Product Designer')
    .replace('{{resumo_ajustado}}', cv.summary)
    .replace('{{skills_list}}', skillsHTML)
    .replace('{{softfocus_periodo}}', ollamaResult.softfocus_periodo || '')
    .replace('{{softfocus_cargo}}', ollamaResult.softfocus_cargo || 'Product Designer')
    .replace('{{softfocus_resultados}}', ollamaResult.softfocus_resultados || '')
    .replace('{{softfocus_metrics}}', fixedMetricsHTML)
    .replace('{{softfocus_bullets_dynamic}}', dynamicBulletsHTML);

  html = replaceEngineering(html);

  const publicDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  const outPath = path.join(publicDir, 'cv_otimizado.html');
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

function generateExternalHTML(cv) {
  const skillsList = Array.isArray(cv.skills_ordered) ? cv.skills_ordered : [];
  const skillsHTML = skillsList.map(s => escapeHtml(s.trim())).filter(Boolean).join(` | `);

  const esc = escapeHtml;
  const experienciaHTML = (cv.experience || []).map(exp => {
    const highlights = (exp.highlights || []).filter(Boolean);
    const skills = (exp.skills || []).filter(Boolean).map(esc).join(' | ');
    return `
    <div class="job">
      <div class="job-header">
        <div class="job-company">${esc(exp.company) || '—'}</div>
        ${exp.period ? `<div class="job-period">${esc(exp.period)}</div>` : exp.years ? `<div class="job-period">${exp.years} anos</div>` : ''}
      </div>
      <div class="job-role">${esc(exp.role) || ''}</div>
      ${exp.domain ? `<p class="job-desc" style="margin-bottom:8px">${esc(exp.domain)}</p>` : ''}
      ${highlights.length ? `<ul class="bullet-list">${highlights.map(h => `<li>${esc(h)}</li>`).join('\n        ')}</ul>` : ''}
      ${skills ? `<div class="job-skills">${skills}</div>` : ''}
    </div>`;
  }).join('\n    <hr class="rule">\n');

  const formacaoHTML = (cv.education || []).map(edu => `
    <div class="edu-item">
      <div class="edu-degree">${esc(edu.degree) || '—'}</div>
      <div class="edu-school">${esc(edu.institution || '')}${edu.year ? ` · ${edu.year}` : ''}</div>
    </div>
  `).join('\n      ');

  const idiomasHTML = (cv.languages || []).map(lang =>
    `<div class="cert-item">${esc(lang.language)} — ${esc(lang.level)}</div>`
  ).join('\n      ');

  const certsHTML = (cv.certifications || []).map(cert =>
    `<div class="cert-item">${esc(cert.name)}${cert.institution ? ` <span>${esc(cert.institution)}${cert.year ? ` · ${cert.year}` : ''}</span>` : ''}</div>`
  ).join('\n      ');

  const contactsHTML = [
    cv.email && `<a href="mailto:${esc(cv.email)}" class="contact-item">${esc(cv.email)}</a>`,
    cv.phone && `<a href="tel:${esc(cv.phone)}" class="contact-item">${esc(cv.phone)}</a>`,
    cv.linkedin && `<a href="${esc(cv.linkedin)}" class="contact-item">${esc(cv.linkedin)}</a>`,
    cv.portfolio && `<a href="${esc(cv.portfolio)}" class="contact-item">${esc(cv.portfolio)}</a>`
  ].filter(Boolean).join('\n      ');

  const styleCSS = fs.readFileSync(path.join(__dirname, 'cv_template.html'), 'utf8');
  const style = styleCSS.substring(styleCSS.indexOf('<style>'), styleCSS.indexOf('</style>') + 7);

  const bodyHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(cv.name || 'Currículo')}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
${style}
</head>
<body>
<div class="page">

  <header class="header">
    <div class="header-name">${esc(cv.name) || 'Currículo'}</div>
    <div class="header-title">${esc(cv.header_title || cv.current_title || 'Product Designer')}</div>
    ${contactsHTML ? `<div class="contacts">${contactsHTML}</div>` : ''}
    <div style="font-size:11.5px;color:var(--ink-light);margin-top:8px">Porecatu – PR (Disponível para atuação Remota ou Híbrida em Maringá/Londrina e região)</div>
  </header>

  <section class="section">
    <div class="section-title">Perfil Profissional</div>
    <p class="summary">${esc(cv.summary) || '—'}</p>
  </section>

  ${skillsHTML ? `<section class="section">
    <div class="section-title">Competências</div>
    <p class="summary">${skillsHTML}</p>
  </section>` : ''}

  ${experienciaHTML ? `<section class="section">
    <div class="section-title">Experiência Profissional</div>
    ${experienciaHTML}
  </section>` : ''}

  ${formacaoHTML ? `<section class="section">
    <div class="section-title">Formação Acadêmica</div>
    <div class="edu-grid">${formacaoHTML}</div>
  </section>` : ''}

  ${idiomasHTML ? `<section class="section">
    <div class="section-title">Idiomas</div>
    <div class="cert-list">${idiomasHTML}</div>
  </section>` : ''}

  ${certsHTML ? `<section class="section">
    <div class="section-title">Certificações</div>
    <div class="cert-list">${certsHTML}</div>
  </section>` : ''}

</div>
<script>window.onload = function () {
  if (window.location.search.includes('print=true')) {
    var printed = false;
    var doPrint = function () { if (!printed) { printed = true; window.print(); } };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(doPrint).catch(doPrint);
    }
    setTimeout(doPrint, 1500); // fallback de seguranca caso fonts.ready nao resolva
  }
};<\/script>
</body>
</html>`;

  const publicDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  const outPath = path.join(publicDir, 'cv_externo.html');
  fs.writeFileSync(outPath, bodyHTML, 'utf8');
  return outPath;
}

module.exports = { generateForJob, generateFromData, generateHTML, generateExternalHTML, computeHeaderTitle };
