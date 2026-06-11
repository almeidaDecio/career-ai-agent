# Skills — Career AI Agent

Biblioteca de habilidades modulares do ecossistema. Cada skill encapsula uma operação atômica do pipeline de análise de vagas.

---

## Sumário

- [skill_matching.js](#skill_matchingjs) — Calculadora de Matching
- [skills_vaga.txt](#skills_vagatxt) — Lista de Skills da Vaga

---

## skill_matching.js

**Tipo:** Skill 2 — Calculadora de Matching Local

**Descrição:** Compara deterministicamente o CV do candidato contra os requisitos de uma vaga usando correspondência textual com stemming, sinônimos EN→PT e word-match ratio. Gera score 0–100 com pesos: Required (70%), Nice-to-have (20%), Tools (10%). Inclui análise independente de ATS Keywords.

### Inputs

| Arquivo | Formato | Descrição |
|---------|---------|-----------|
| `sample_job.json` | JSON | Vaga com `required_skills`, `nice_to_have_skills`, `tools`, `ats_keywords` |
| `sample_cv.json` | JSON | Currículo com `categories.*.skills`, `categories.*.evidence`, `summary`, `education`, `languages` |

### Outputs

| Saída | Formato | Descrição |
|-------|---------|-----------|
| Console | Texto | Log detalhado com checkboxes de cada skill |
| `matching_result.json` | JSON | Score, ATS %, listas de matched/missing, strengths, gaps |

### Score Formula

```
Required (70%) = matchedRequired / totalRequired * 70
Nice-to-have (20%) = matchedNice / totalNice * 20
Tools (10%) = matchedTools / totalTools * 10
Overall = Required + Nice-to-have + Tools (0–100)
```

### Como Usar

```bash
node skills/skill_matching.js
```

> Executar na raiz do projeto (`career-ai-agent/`), pois os JSONs são lidos com caminhos relativos ao CWD.

### Algoritmo

1. **Normalização:** lowercase, remoção de acentos/pontuação, substituição de sinônimos (ex: `usability testing` → `testes usabilidade`)
2. **Stemming:** palavras compartilham prefixo ≥ 5 caracteres contam como match
3. **Word-match ratio:** ≥ 40% das palavras da skill (length > 3) encontradas no texto do CV
4. **Cross-text search:** concatena todo o texto do CV (summary + skills + evidence + education + languages) para capturar skills distribuídas em múltiplas seções

### Exemplo de Resultado

```
Score: 90/100
Required: 13/13 (70.0 pts)
Nice-to-have: 2/3 (13.3 pts)
Tools: 2/3 (6.7 pts)
ATS Keywords: 100%
```

---

## skills_vaga.txt

**Tipo:** Extração de Skills (lista auxiliar)

**Descrição:** Lista de 15 habilidades-chave extraídas de uma vaga específica de Product Designer Sênior, separadas por vírgula. Usada como referência rápida para conferência manual ou como input para workflows do n8n.

### Conteúdo

```
Ciclo Completo de Produto, Discovery, Handoff, Pesquisa Qualitativa,
Pesquisa Quantitativa, Entrevistas com Usuários, Testes de Usabilidade,
Prototipação de Alta Fidelidade, Figma, Design System, Métricas de Produto,
IA Generativa, Metodologias Ágeis, B2B SaaS, Design Thinking
```

### Como Usar

Importar como texto ou vetor em scripts:

```js
const skills = fs.readFileSync('skills/skills_vaga.txt', 'utf8').split(', ').map(s => s.trim());
```

---

---

## skill_extraction.js

**Tipo:** Skill 1 — Extração Semântica Local

**Descrição:** Envia uma descrição de vaga para o modelo Ollama customizado `job-analyzer` e retorna um JSON estruturado com cargo, senioridade, skills, responsabilidades, ferramentas e ATS keywords. Inclui validação e recuperação de JSON quebrado.

### Input

| Parâmetro | Formato | Descrição |
|-----------|---------|-----------|
| Argumento 1 | String | Caminho de arquivo `.txt` ou texto direto da vaga |
| `--save` | Flag | Salva o resultado em `sample_job.json` |

### Output

| Saída | Formato | Descrição |
|-------|---------|-----------|
| Console | JSON | Objeto extraído formatado |
| `sample_job.json` | JSON | (opcional) Arquivo salvo com `--save` |

### Schema de Saída

```json
{
  "job_title": "Product Designer Sênior",
  "company": "Nome da Empresa ou null",
  "seniority": "senior | mid | junior | lead | not_specified",
  "experience_years_min": 5,
  "location": "Remoto ou null",
  "required_skills": ["skill1", "skill2"],
  "nice_to_have_skills": ["skill1", "skill2"],
  "responsibilities": ["resp1", "resp2"],
  "tools": ["Figma", "etc"],
  "ats_keywords": ["keyword1", "keyword2"]
}
```

### Como Usar

```bash
# De um arquivo de texto
node skills/skill_extraction.js descricao_vaga.txt --save

# De texto direto
node skills/skill_extraction.js "Buscamos Product Designer Sênior..." --save
```

### Modelo

Usa o modelo customizado `job-analyzer` (llama3.2:3b com temperatura 0 e system prompt configurado via Modelfile em `prompts/Modelfile`).
