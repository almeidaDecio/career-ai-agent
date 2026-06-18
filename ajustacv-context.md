---
# Metadados da skill (exemplo)
name: chart
description: Create charts and visualizations using Plotly and Mermaid
version: 1.0.0
---

# Conteúdo da skill começa aqui...

# AjustaCV Skill

## Objetivo
Ajudar com tarefas relacionadas ao projeto AjustaCV, incluindo análise de vagas, matching com CV, geração de CV otimizado e suporte à arquitetura do sistema.

## Contexto do projeto
O AjustaCV é um sistema local-first de triagem inteligente de vagas + geração de CV otimizado por IA. Ele roda 100% local, sem nuvem e sem custos recorrentes.

## Stack técnica
- Backend: Node.js + Express 5.
- Banco de dados: SQLite com `better-sqlite3`, usando `career_agent.db`.
- IA: Ollama local em `http://127.0.0.1:11434`, com modelo `job-analyzer`.
- Frontend: HTML, Vanilla JS e CSS puro, usando o Design System Azul.
- Upload: Multer.

## Estrutura do projeto
- `backend/server.js`: API principal, com 23 rotas na porta 3001.
- `backend/matcher.js`: motor de matching de skills.
- `backend/cv_generator.js`: geração de CV.
- `backend/skill_expander.js`: expansão de sinônimos.
- `backend/cv_template.html`: template de CV.
- `frontend/index.html`: SPA Kanban.
- `frontend/app.js`: lógica do frontend.
- `frontend/style.css`: estilos do app.
- `frontend/ds/`: Design System Azul.
- `data/`: cache de CVs gerados.
- `public/`: CVs exportados.
- `docs/`: documentação e apresentações.
- `career_agent.db`: banco SQLite.

## Design System Azul
Use os tokens e componentes existentes do projeto.

### Tokens principais
- Brand: Teal `#22D3C5` no dark e `#0B7D73` no light.
- Surfaces: `--color-surface-primary`, `--color-bg-canvas`.
- Texto: `--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`, `--color-text-disabled`, `--color-text-inverse`.
- Bordas: `--color-border-subtle`, `--color-border-default`, `--color-border-hover`, `--color-border-strong`.
- Semântica: `--color-success`, `--color-warning`, `--color-error`, `--color-info`.
- Tipografia: `xs(12)`, `sm(14)`, `base(16)`, `lg(18)`, `xl(24)`, `2xl(32)`, `3xl(40)`, `4xl(56)`.
- Espaçamento: `space-2xs(4)`, `xs(8)`, `sm(12)`, `md(16)`, `lg(24)`, `xl(32)`, `2xl(48)`.
- Cantos: `radius-sm(4)`, `md(8)`, `lg(12)`, `xl(16)`, `full(999)`.
- Temas: `data-theme="light"`, `data-brand="client-a|b|c"`, `data-contrast="high"`.

### Componentes
Use as classes BEM já definidas, como `.btn`, `.card`, `.badge`, `.input`, `.select`, `.tabs`, `.dialog`, `.toast`, `.progress`, `.spinner`, `.skeleton`, `.avatar`, `.table`, `.pagination`, `.tooltip` e `.form-group`.

## Endpoints principais
- `GET/POST /api/jobs`: listar e criar vagas.
- `GET/PUT/DELETE /api/jobs/:id`: CRUD de vaga individual.
- `POST /api/jobs/:id/details`: salvar detalhes como data de inscrição e entrevista.
- `POST /api/extract`: extrair dados da vaga via Ollama e calcular matching.
- `POST /api/cv/parse`: parse de CV externo.
- `POST /api/jobs/:id/generate-cv`: gerar CV otimizado para uma vaga.
- `POST /api/jobs/:id/export-pdf`: exportar CV em PDF.

## Fluxo de uso
1. O usuário cola a descrição da vaga ou faz upload.
2. O sistema extrai requisitos via Ollama e calcula o match com o CV base.
3. A vaga aparece no Kanban com nota de compatibilidade.
4. O usuário move a vaga entre as colunas triagem, aplicadas, favoritas, entrevista e finalizada.
5. O painel lateral mostra detalhes e permite editar informações.
6. O comando de gerar CV cria uma versão personalizada para a vaga.
7. O resultado pode ser exportado como HTML, TXT ou PDF.

## Convenções importantes
- Use variáveis CSS `var(--color-*)`; não use cores hardcoded.
- O dark mode é o padrão; light mode usa `data-theme="light"`.
- Acessibilidade deve incluir `:focus-visible` nos elementos interativos.
- O modo de alto contraste usa `data-contrast="high"`.
- A interface atual não depende de media queries específicas.

## Comandos úteis
- `node setup_db.js`: inicializa o banco.
- `node backend/server.js`: sobe o servidor na porta 3001.
- Ollama local: `http://127.0.0.1:11434` com o modelo `job-analyzer`.

## Instrução operacional
Quando a solicitação estiver relacionada ao AjustaCV, responda com foco em:
- arquitetura do sistema,
- backend e rotas,
- regras do Design System Azul,
- geração e otimização de CV,
- matching de vagas e sinônimos,
- estrutura de arquivos e convenções do projeto.