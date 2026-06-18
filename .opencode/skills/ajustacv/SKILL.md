---
name: ajustacv
description: Contexto completo do projeto AjustaCV - sistema local-first de triagem de vagas e geracao de CV com IA
license: MIT
compatibility: opencode
---

# AjustaCV — Contexto do Projeto

## Stack
Backend: Node + Express 5 + SQLite. IA: Ollama local (job-analyzer). Frontend: HTML + Vanilla JS + CSS puro.

## Design System Azul
Tokens em `frontend/ds/`. Brand teal `#22D3C5` (dark) / `#0B7D73` (light). Temas: claro, escuro, multi-brand, alto contraste. Componentes BEM: .btn, .card, .badge, .input, .tabs, .dialog, .toast, .skeleton, etc.

## Arquivos-chave
- `backend/server.js` — API REST (23 rotas, porta 3001)
- `frontend/index.html` — SPA Kanban
- `frontend/ds/tokens.css` + `components.css` + `themes.css` — Design System
- `sample_cv.json` — CV base do candidato

## API principal
- `POST /api/extract` — Extrair vaga + calcular match
- `POST /api/jobs/:id/generate-cv` — Gerar CV otimizado
- `GET/POST /api/jobs` — Listar/criar vagas
- Kanban: triagem → aplicadas → favoritas → entrevista → finalizada

## Convenções
- CSS com `var(--color-*)`, sem valores hardcoded
- Dark mode default, light via `data-theme="light"`
- `:focus-visible` e estados explícitos (sem `filter: brightness()`)