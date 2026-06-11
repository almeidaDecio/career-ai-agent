const fs = require('fs');
const http = require('http');

const OLLAMA_HOST = 'http://127.0.0.1:11434';
const MODEL = 'job-analyzer';

// Aceita input de um arquivo .txt ou texto direto via argumento
const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Uso: node skills/skill_extraction.js <arquivo.txt | "texto da vaga">');
  process.exit(1);
}

let jobText;
if (fs.existsSync(inputPath)) {
  jobText = fs.readFileSync(inputPath, 'utf8');
  console.log(`Lendo: ${inputPath}\n`);
} else {
  jobText = inputPath;
}

console.log('Extraindo requisitos com Ollama...');
console.log(`Modelo: ${MODEL}\n`);

function callOllama(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: MODEL,
      prompt: prompt,
      stream: false,
      options: { temperature: 0 }
    });

    const req = http.request(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed.response || parsed);
        } catch (e) {
          reject(new Error(`Falha ao parsear resposta do Ollama: ${e.message}\n${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function extractJson(raw) {
  // Tenta parsear direto
  let cleaned = raw.trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  // Remove markdown fences se houver
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  // Encontra primeiro { e último }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (_) {}
  }

  throw new Error(`Não foi possível extrair JSON da resposta:\n${raw.slice(0, 500)}`);
}

async function main() {
  try {
    const raw = await callOllama(jobText);
    const result = extractJson(raw);

    console.log('=== EXTRAÇÃO CONCLUÍDA ===\n');
    console.log(JSON.stringify(result, null, 2));

    // Valida campos obrigatórios
    const required = ['job_title', 'required_skills'];
    const missing = required.filter(k => !result[k]);
    if (missing.length > 0) {
      console.warn(`\n⚠️  Campos ausentes: ${missing.join(', ')}`);
    }

    // Pergunta se quer salvar como sample_job.json
    const save = process.argv.includes('--save');
    if (save) {
      const outPath = 'sample_job.json';
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.log(`\n✅ Salvo em ${outPath}`);
    }

  } catch (e) {
    console.error('❌ Erro:', e.message);
    process.exit(1);
  }
}

main();
