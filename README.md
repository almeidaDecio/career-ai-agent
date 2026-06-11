# Career AI Agent 🚀

Um ecossistema modular e Local-First de agentes de inteligência artificial e automação projetado para buscar vagas de emprego, extrair requisitos de negócios, otimizar currículos (RAG) e preparar portfólios e cases para entrevistas. 

Este projeto foi desenvolvido com uma arquitetura **100% autônoma e local**, focada em soberania de dados, privacidade absoluta e custo zero de execução.

---

## 🛠️ Arquitetura Técnica

O sistema funciona em quatro pilares integrados localmente:
1. **Orquestrador de Automação:** n8n instalado localmente via `npm`.
2. **Motor Cognitivo de IA:** Ollama local executando o modelo `llama3` (ou `mistral`).
3. **Banco de Dados:** SQLite local para controle de status e histórico.
4. **Interface Visual (Dashboard):** Web App customizado desenvolvido em Node/Express (Backend) + HTML5/CSS3/JS (Frontend).

---

## 📂 Estrutura de Pastas Recomendada

```text
career-ai-agent/
├── README.md               # Este arquivo de referência
├── database/               # Scripts SQL e banco SQLite
│   ├── db_init.sql         # Script de criação de tabelas
│   └── career_ai.db        # Banco de dados SQLite local (gerado no Dia 15)
├── skills/                 # Biblioteca de prompts e lógica de Skills
│   ├── skill_extraction.js # Skill 1 - Extração de Vagas
│   └── skill_matching.js   # Skill 2 - Calculadora de Matching
├── backend/                # Servidor Express API
│   ├── package.json
│   ├── server.js           # API REST local (gerado no Dia 16)
│   └── .env                # Variáveis de ambiente locais
├── frontend/               # Interface Web (Dashboard)
│   ├── index.html          # Painel Kanban (gerado no Dia 18)
│   ├── style.css           # CSS premium contemporâneo
│   └── app.js              # Interações e chamadas de API do frontend
├── docs/                   # Documentações e capturas de tela
│   └── case_study.md       # Documento do Case de Portfólio
└── scratch/                # Arquivos temporários / currículos originais
```

---

## 🚀 Guia de Início Rápido (Dia 1)

### Passo 1: Instalação do Ollama
1. Baixe e instale o Ollama para Windows pelo link oficial: [ollama.com/download](https://ollama.com/download)
2. Após a instalação, certifique-se de que o Ollama está rodando em segundo plano (você verá o ícone na barra de tarefas do Windows).
3. Abra o PowerShell ou Prompt de Comando e execute o comando abaixo para baixar e inicializar o modelo de IA local:
   ```bash
   ollama run llama3
   ```
4. Digite uma pergunta de teste no terminal para garantir que o modelo está respondendo.

### Passo 2: Verificando as Dependências de Node.js
Como instalaremos o n8n e o servidor Express localmente, você precisará do **Node.js** instalado na sua máquina:
1. Verifique se o Node está instalado executando no PowerShell:
   ```bash
   node -v
   ```
2. Caso não esteja instalado, baixe a versão recomendada LTS pelo site oficial: [nodejs.org](https://nodejs.org)

---

## 👨‍💻 Próximos Passos (Semana 1)
Estamos na **Semana 1**, focada em configurar a inteligência local (Ollama) e construir nossas **Skills** (as habilidades inteligentes que rodam nos agentes). 

* Mentor do Projeto: **Antigravity (Google DeepMind)**
* Desenvolvedor Líder: **Você (Product Designer & AI Builder)**
