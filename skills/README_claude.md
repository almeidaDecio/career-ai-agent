# Skills — Career AI Agent
### Módulo de Inteligência: Como o sistema pensa sobre vagas e perfis

> Este documento explica, em linguagem acessível, as duas capacidades centrais de análise do Career AI Agent — um sistema que automatiza a triagem de vagas de emprego e a comparação com o perfil do candidato, rodando 100% no computador local, sem custos de nuvem e sem compartilhar dados pessoais com nenhum serviço externo.

---

## O que são as Skills?

Pense nas Skills como **especialistas virtuais** dentro do sistema. Cada uma tem uma função específica, recebe uma entrada bem definida e entrega um resultado estruturado. Juntas, elas formam o núcleo de raciocínio do agente.

O sistema atualmente conta com duas Skills principais:

| Skill | Função |
|-------|--------|
| **Skill 1 — Extração de Vaga** | Lê o texto de uma vaga e identifica o que realmente importa |
| **Skill 2 — Calculadora de Matching** | Compara a vaga com o perfil do candidato e gera uma nota de compatibilidade |

---

## Skill 1 — Extração de Vaga
`skill_extraction.js`

### O que faz

Quando uma nova vaga é capturada (via feed RSS ou colada manualmente), essa skill lê o texto bruto da descrição e extrai as informações essenciais de forma organizada — como se um recrutador sênior tivesse sublinhado os pontos críticos do anúncio.

### O que ela identifica

A partir de qualquer texto de vaga, o sistema consegue identificar automaticamente:

- **Cargo e nível de senioridade** — Júnior, Pleno, Sênior, Lead
- **Empresa e localização** — incluindo se é remoto
- **Habilidades obrigatórias** — o que a empresa exige
- **Habilidades diferenciais** — o que a empresa valoriza, mas não exige
- **Responsabilidades do cargo** — o que você vai fazer no dia a dia
- **Ferramentas mencionadas** — Figma, Notion, Jira, etc.
- **Palavras-chave de ATS** — os termos que sistemas automatizados de triagem de currículos procuram

### Por que isso importa

A maioria das pessoas candidatas lê uma vaga e destaca mentalmente 3 ou 4 pontos. Esse sistema lê a mesma vaga e extrai estruturadamente mais de 10 dimensões de informação — em segundos, com consistência e sem viés de atenção.

---

## Skill 2 — Calculadora de Matching
`skill_matching.js`

### O que faz

Com a vaga já extraída pela Skill 1, essa skill compara as exigências da vaga com o perfil completo do candidato e calcula uma **nota de compatibilidade de 0 a 100** — detalhando exatamente onde há alinhamento e onde existem lacunas.

### Como a nota é calculada

A fórmula foi desenhada para refletir o que as empresas realmente priorizam:

| Critério | Peso | Raciocínio |
|----------|------|------------|
| Habilidades obrigatórias | 70% | São os requisitos inegociáveis da vaga |
| Habilidades diferenciais | 20% | Aumentam a competitividade do candidato |
| Ferramentas | 10% | Relevantes, mas geralmente aprendíveis |

### O que o resultado mostra

Além da nota geral, o sistema entrega:

- ✅ Lista de competências que **batem** com a vaga
- ❌ Lista de competências que estão **faltando**
- 💪 **Pontos fortes** do candidato para aquela posição específica
- 🎯 **Gaps prioritários** — o que estudar ou destacar melhor no currículo
- 📊 **Taxa de cobertura de palavras-chave ATS** — a porcentagem dos termos que os sistemas automáticos de triagem vão encontrar no currículo

### Exemplo real de saída

```
Compatibilidade geral: 90/100

Habilidades obrigatórias:  13 de 13 atendidas  →  70,0 pts
Habilidades diferenciais:   2 de 3 atendidas   →  13,3 pts
Ferramentas:                2 de 3 atendidas   →   6,7 pts
Cobertura ATS:             100%
```

### Inteligência por trás do algoritmo

O sistema não faz uma comparação ingênua de palavras idênticas. Ele usa três camadas de análise para capturar correspondências reais:

1. **Sinônimos multilíngues** — "usability testing" e "testes de usabilidade" são tratados como a mesma competência
2. **Raiz das palavras** — "prototipação" e "protótipos" são reconhecidos como conceitos relacionados
3. **Busca cruzada no currículo** — a skill é procurada em todas as seções do CV (resumo, experiências, formação, idiomas), não apenas na lista de competências

---

## Decisões de design por trás das Skills

Como Product Designer, algumas escolhas de arquitetura refletem diretamente princípios de UX aplicados ao design de sistemas:

**Modularidade como escalabilidade** — cada skill é independente e pode ser usada, testada ou melhorada sem afetar o restante do sistema. O mesmo princípio de componentes reutilizáveis que aplicamos em Design Systems.

**Output estruturado como contrato** — as skills sempre entregam o mesmo formato de saída (JSON), garantindo que o dashboard consuma os dados sem surpresas. É o equivalente de uma especificação de handoff bem definida.

**Pesos configuráveis** — a fórmula de matching pode ser ajustada conforme a estratégia do candidato. Para quem está mudando de área, por exemplo, faz sentido reduzir o peso das ferramentas e aumentar o das habilidades comportamentais.

---

## Estrutura de arquivos

```
career-ai-agent/
└── skills/
    ├── skill_extraction.js   — Skill 1: leitura e estruturação da vaga
    ├── skill_matching.js     — Skill 2: comparação vaga × perfil
    ├── skills_vaga.txt       — Lista auxiliar de skills extraídas (referência manual)
    └── README.md             — Este documento
```

---

*Faz parte do projeto Career AI Agent — um ecossistema local-first de automação de candidaturas desenvolvido como case de portfólio em Product Design & AI Engineering.*
