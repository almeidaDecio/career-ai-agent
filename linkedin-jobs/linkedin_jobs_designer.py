#!/usr/bin/env python3
"""
Scraper de vagas do LinkedIn — adaptado para Product Designer.

Baseado no projeto original de Hendrix Freire:
https://github.com/hendrixfreire/linkedin-job-scraper

Usa a API pública (sem login) "Guest" do LinkedIn pra buscar vagas e
aplica deduplicação em 3 camadas. Roda sozinho via cron e gera um JSON
que o AjustaCV pode importar diretamente (em vez de depender de um
agente externo como o Hermes).

O QUE MUDOU EM RELAÇÃO AO ORIGINAL:
- KEYWORDS: de "data engineer" etc → termos de Product Design
- heuristic_score(): stack/skills trocadas pra UX/Product Design
- build_searches(): localização ajustada pra Porecatu/PR, Ponta Grossa/PR
  e remoto Brasil (em vez de São Paulo)
- Removida a dependência de LINKEDIN_CRON_OUTPUT_DIR (não usamos agente
  externo — o próprio AjustaCV vai consumir o jobs_new.json direto)

ARQUITETURA DE DEDUP (3 camadas, igual ao original):
1. seen.json → IDs persistentes + chaves (título||empresa) — nunca repete vaga
2. seen_keys → pega vagas repostadas com ID novo (mesmo título+empresa)
3. MD legado → fallback de IDs extraídos do arquivo jobs.md

PIPELINE:
Script (busca → dedup → filtro → detalhes) → JSON (vagas novas com
heuristic_score) → AjustaCV importa via /api/jobs/import-batch

SAÍDAS:
- stdout: resumo da execução
- jobs_new.json: vagas novas pro AjustaCV importar
- jobs.md: histórico legível (só acrescenta, nunca remove)
- seen.json: estado de dedup
- keywords.json: tracking de yield por keyword

CONFIGURAÇÃO:
Tudo customizável via variável de ambiente:
- LINKEDIN_OUTPUT_DIR: onde salvar os arquivos (padrão: ~/linkedin-jobs)
- LINKEDIN_USER_NAME: nome no cabeçalho do MD (padrão: "User")
"""

import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode

# ═══════════════════════════════════════════════════════════════
# CONFIGURAÇÃO (sobrescreva via variáveis de ambiente)
# ═══════════════════════════════════════════════════════════════

BASE_DIR = Path(os.environ.get("LINKEDIN_OUTPUT_DIR", Path.home() / "linkedin-jobs"))
USER_NAME = os.environ.get("LINKEDIN_USER_NAME", "Décio")

# Garante que a pasta de saída existe antes de qualquer leitura/escrita.
# Sem isso, write_text() falha com FileNotFoundError em sistemas onde a
# pasta ainda não foi criada manualmente (comum em primeira execução no Windows).
BASE_DIR.mkdir(parents=True, exist_ok=True)

VAGAS_FILE = BASE_DIR / "jobs.md"
JOBS_JSON = BASE_DIR / "jobs_new.json"
SEEN_JSON = BASE_DIR / "seen.json"
KEYWORDS_FILE = BASE_DIR / "keywords.json"

BASE_SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
BASE_JOB_URL = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{}"

# ---- FILTROS DA API ----
# f_TPR: tempo de publicação (r86400=24h, r604800=semana, r2592000=mês)
# f_E: nível de experiência (1=Estágio, 2=Entry, 3=Associate, 4=Pleno/Senior,
#      5=Diretor, 6=Executivo)
# f_WT: modalidade (1=Presencial, 2=Remoto, 3=Híbrido)
# sortBy=DD: ordenar por data decrescente (mais novas primeiro)

# ---- KEYWORDS ----
# Customize pro seu perfil. Cada uma gera 2 buscas:
# Remoto Brasil + região de Ponta Grossa/PR (sem filtro de modalidade)
KEYWORDS = [
    "product designer",
    "ux designer",
    "ux/ui designer",
    "design de produto",
    "design systems",
    "ux research",
    "product design lead",
    "senior product designer",
]

SEARCHES = []


def build_searches(keywords):
    """Monta as buscas a partir da lista de keywords ativas.

    Cada keyword gera 2 buscas: Remoto Brasil + Ponta Grossa/PR (sem
    filtro de modalidade, retorna remoto+híbrido+presencial e filtramos
    localmente depois). Cargos "lead"/"senior" pulam o filtro f_E=4
    (já são senior por definição).
    """
    searches = []

    # Remoto no Brasil — com filtro de senioridade pleno/senior+
    for kw in keywords:
        search = {"keywords": kw, "location": "Brazil", "f_WT": "2",
                  "f_E": "4", "f_TPR": "r2592000", "sortBy": "DD"}
        if any(m in kw.lower() for m in ["lead", "senior", "head"]):
            del search["f_E"]  # lead/senior já é senior por definição
        searches.append(search)

    # Ponta Grossa/PR sem filtro de modalidade — retorna remoto+híbrido+presencial.
    # Filtramos presencial fora da região durante o fetch de detalhes (fetch_one).
    for kw in keywords:
        search = {"keywords": kw, "location": "Ponta Grossa, Paraná, Brazil",
                  "f_TPR": "r2592000", "sortBy": "DD"}
        if not any(m in kw.lower() for m in ["lead", "senior", "head"]):
            search["f_E"] = "4"
        searches.append(search)

    return searches


# Inicializa com todas as keywords (pruning pode reduzir isso depois)
SEARCHES = build_searches(KEYWORDS)

# ---- HTTP HEADERS ----
# User-Agent do Chrome macOS pra evitar ser bloqueado como bot
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5",
}


def fetch_url(url, retries=1):
    """Requisição HTTP com retry e rate limiting.

    Tenta até retries+1 vezes. Em caso de falha:
    - Espera 2s e tenta de novo (se ainda houver tentativas)
    - Na última tentativa, registra o erro e retorna string vazia
    Timeout de 8s por requisição — a API do LinkedIn pode ser lenta.
    """
    for attempt in range(retries + 1):
        try:
            req = Request(url, headers=HEADERS)
            with urlopen(req, timeout=8) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            if attempt < retries:
                time.sleep(2)  # backoff fixo de 2s entre tentativas
            else:
                print(f"Erro ao buscar {url}: {e}", file=sys.stderr)
                return ""


def parse_search_results(html):
    """Extrai vagas do HTML de busca via regex.

    O HTML da API Guest tem uma estrutura conhecida:
    <li data-entity-urn="urn:li:jobPosting:123456"> ... </li>
    Cada card contém: título (base-search-card__title), empresa
    (hidden-nested-link ou base-search-card__subtitle), local
    (job-search-card__location), data (<time datetime="...">).

    Retorna lista de dicts com id, url, title, company, location,
    date (ISO), date_label (texto relativo como 'há 1 semana').
    """
    jobs = []
    seen_ids = set()  # dedup dentro da própria página (API às vezes duplica cards)

    card_pattern = re.compile(
        r'data-entity-urn="urn:li:jobPosting:(\d+)"(.*?)</li>',
        re.DOTALL
    )

    for match in card_pattern.finditer(html):
        job_id = match.group(1)
        card_html = match.group(2)

        if job_id in seen_ids:
            continue
        seen_ids.add(job_id)

        title_match = re.search(
            r'base-search-card__title[^>]*>\s*(.*?)\s*</h3>',
            card_html, re.DOTALL
        )
        title = title_match.group(1).strip() if title_match else ""
        title = re.sub(r'<[^>]+>', '', title).strip()

        company_match = re.search(
            r'hidden-nested-link[^>]*>\s*(.*?)\s*</a>',
            card_html, re.DOTALL
        )
        if not company_match:
            company_match = re.search(
                r'base-search-card__subtitle[^>]*>(.*?)</h4>',
                card_html, re.DOTALL
            )
        company = company_match.group(1).strip() if company_match else ""
        company = re.sub(r'<[^>]+>', '', company).strip()

        location_match = re.search(
            r'job-search-card__location[^>]*>\s*(.*?)\s*</span>',
            card_html, re.DOTALL
        )
        location = location_match.group(1).strip() if location_match else ""

        date_match = re.search(
            r'<time[^>]*datetime="([^"]*)"[^>]*>(.*?)</time>',
            card_html, re.DOTALL
        )
        date_iso = date_match.group(1).strip() if date_match else ""
        date_label = re.sub(r'<[^>]+>', '', date_match.group(2)).strip() if date_match else ""

        jobs.append({
            "id": job_id,
            "url": f"https://www.linkedin.com/jobs/view/{job_id}",
            "title": title,
            "company": company,
            "location": location,
            "date": date_iso,
            "date_label": date_label,
        })

    return jobs


def search_jobs(params, max_pages=1, deadline=None):
    """Busca vagas via API Guest com paginação opcional.

    Cada página retorna até 25 vagas. O parâmetro 'start' controla
    o offset (0, 25, 50, ...). Se uma página não retornar nada novo
    (new_count == 0), a paginação para.

    Respeita o deadline global — se o tempo acabar, para imediatamente.
    0.3s de espera entre páginas pra não sobrecarregar a API.
    """
    all_jobs = []
    seen_ids = set()  # dedup entre páginas

    for page in range(max_pages):
        if deadline and time.time() > deadline:
            print(f"Deadline atingido — parando busca: {params.get('keywords','')}", file=sys.stderr)
            break

        start = page * 25
        p = {**params, "start": start}
        url = f"{BASE_SEARCH_URL}?{urlencode(p)}"
        html = fetch_url(url)

        if not html:
            break

        jobs = parse_search_results(html)
        new_count = 0
        for job in jobs:
            if job["id"] not in seen_ids:
                seen_ids.add(job["id"])
                all_jobs.append(job)
                new_count += 1

        if new_count == 0:
            break

        time.sleep(0.3)  # rate limiting: 300ms entre páginas

    return all_jobs


def get_job_details(job_id):
    """Extrai detalhes de uma vaga específica via API de detalhes.

    Busca a página individual da vaga, limpa o HTML e extrai:
    - work_mode: Remoto/Híbrido/Presencial (regex case-insensitive)
    - description: primeiros 500 caracteres após marcadores conhecidos
    - closed: True se a vaga não aceita mais candidaturas

    Retorna dict vazio se a API falhar.
    """
    url = BASE_JOB_URL.format(job_id)
    html = fetch_url(url)
    if not html:
        return {}

    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text).strip()

    details = {}

    for pattern in [r'(Remote|Remoto|Hybrid|Híbrido|On-site|Presencial)']:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            details["work_mode"] = match.group(1)
            break

    for marker in ["Job description", "Descrição da vaga", "About the job", "Responsibilities"]:
        idx = text.lower().find(marker.lower())
        if idx > 0:
            desc = text[idx:idx+800]
            details["description"] = desc.strip()[:500]
            break

    if "no longer accepting applications" in text.lower() or "não aceita mais" in text.lower():
        details["closed"] = True

    return details


# ═══════════════════════════════════════════════════════════════
# GERENCIAMENTO DE ESTADO PERSISTENTE
# ═══════════════════════════════════════════════════════════════
# Todo dedup e tracking é salvo em JSON no disco.
# Nada depende de um agente externo — o script é autossuficiente.

def load_seen_ids():
    """Carrega IDs já vistos do SEEN_JSON (fonte primária de dedup)."""
    try:
        data = json.loads(SEEN_JSON.read_text(encoding="utf-8"))
        return set(data.get("seen_ids", []))
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return set()


def load_existing_from_md():
    """Fallback: lê IDs do arquivo MD legado (jobs.md)."""
    try:
        content = VAGAS_FILE.read_text(encoding="utf-8")
        return set(re.findall(r'linkedin\.com/jobs/view/(\d+)', content))
    except FileNotFoundError:
        return set()


def normalize_key(title, company):
    """Gera uma chave normalizada pra dedup de título+empresa.

    Normalização aplicada:
    1. Remove tags HTML (&amp; → &, etc.)
    2. Lowercase
    3. Remove sufixos comuns: (PJ), - Remoto, | Pleno, etc.

    Aplicado tanto a TÍTULO quanto a EMPRESA — assim
    'Bees Brasil' e 'Bees Brasil (AB InBev)' ficam com a mesma chave.
    Formato final: 'titulo||empresa' (separador || é seguro).
    """
    t = re.sub(r'<[^>]+>', '', title).strip().lower()
    c = re.sub(r'<[^>]+>', '', company).strip().lower()

    t = t.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    c = c.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')

    for pat in [r'\s*[-–—]\s*.*$', r'\s*\(.*?\)\s*$', r'\s*\|.*$']:
        t = re.sub(pat, '', t).strip()
        c = re.sub(pat, '', c).strip()

    return f"{t}||{c}"


def load_seen_keys():
    """Carrega chaves título+empresa já vistas do SEEN_JSON.

    Complementa load_seen_ids() — pega vagas repostadas com ID novo
    mas mesmo título e empresa (LinkedIn gera ID novo quando uma vaga
    é fechada e reaberta).
    """
    try:
        data = json.loads(SEEN_JSON.read_text(encoding="utf-8"))
        return set(data.get("seen_keys", []))
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return set()


def save_full_state(seen_ids, seen_keys, new_ids, new_keys):
    """Salva o estado completo no SEEN_JSON (merge de antigo + novo)."""
    all_ids = sorted(seen_ids | new_ids)
    all_keys = sorted(seen_keys | new_keys)

    SEEN_JSON.write_text(json.dumps({
        "seen_ids": all_ids,
        "seen_keys": all_keys,
        "count_ids": len(all_ids),
        "count_keys": len(all_keys),
        "updated_at": datetime.now().isoformat(),
    }, ensure_ascii=False, indent=2), encoding="utf-8")


def load_keyword_stats():
    """Carrega estatísticas de yield por keyword."""
    try:
        return json.loads(KEYWORDS_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"keywords": {}, "pruned": []}


def save_keyword_stats(stats):
    """Salva as estatísticas de keywords no disco."""
    KEYWORDS_FILE.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")


def update_keyword_stats(stats, keyword, new_count):
    """Atualiza o yield de uma keyword — incrementa runs e contagem de vagas novas."""
    if keyword not in stats["keywords"]:
        stats["keywords"][keyword] = {"total_runs": 0, "total_new": 0, "last_new": None}

    ks = stats["keywords"][keyword]
    ks["total_runs"] += 1
    ks["total_new"] += new_count
    ks["last_run"] = datetime.now().isoformat()
    if new_count > 0:
        ks["last_new"] = datetime.now().isoformat()


def prune_keywords(keywords, stats, min_runs=15, min_yield=2):
    """Remove keywords que não produziram nada após N execuções.

    Critério: keyword com pelo menos min_runs execuções E menos de
    min_yield vagas no total é removida. Keywords novas (< min_runs
    execuções) têm um período de graça.

    Se o pruning remover demais, mantém pelo menos 4 ativas.
    """
    active = []
    for kw in keywords:
        ks = stats["keywords"].get(kw)

        if not ks or ks["total_runs"] < min_runs:
            active.append(kw)
            continue

        if ks["total_new"] < min_yield:
            print(f"Keyword removida: '{kw}' ({ks['total_runs']} runs, {ks['total_new']} vagas)", file=sys.stderr)
            stats["pruned"].append({"keyword": kw, "at": datetime.now().isoformat(),
                                     "runs": ks["total_runs"], "yield": ks["total_new"]})
            continue

        active.append(kw)

    if len(active) < 4:
        active = keywords[:max(4, len(keywords))]

    return active


def heuristic_score(job):
    """Nota heurística de 1-5 estrelas baseada em título + local.

    Usada pelo matcher.js do AjustaCV como ponto de partida — só
    vagas borderline (score 2-4) precisam ser reavaliadas com mais
    cuidado. Isso reduz processamento desnecessário no Ollama.

    Pontuação (cumulativa):
      Área/skill: +2 (alta: product designer, ux research, etc.)
                  +1 (média: figma, design systems, ui design, etc.)
                  +0 (não identificado)
      Nível:      +2 (senior, lead, manager, head, etc.)
                  +2 (sem indicador — assume pleno/senior, padrão de mercado BR)
                  →1 (junior/estágio → descartado imediatamente)
      Local:      +1 (remoto, híbrido PG, presencial PG)
                  +0 (outros)

    Conversão score → estrelas:
      4+ → 5★ | 3 → 4★ | 2 → 3★ | 1 → 2★ | 0 → 1★
    """
    title = job.get("title", "").lower()
    loc = job.get("location", "").lower()

    score = 0
    reasons = []

    # ---- ÁREA / SKILLS (0-2 pontos) ----
    # Alta relevância pro perfil de Product Design
    high_skills = ["product designer", "product design", "ux research", "design de produto",
                   "design systems", "ux/ui", "interaction design", "lead designer",
                   "design lead", "head of design", "head de design"]
    # Média relevância (ferramentas e termos adjacentes)
    mid_skills = ["ux designer", "ui designer", "figma", "prototipagem", "design thinking",
                  "user experience", "interface designer", "visual designer"]

    if any(s in title for s in high_skills):
        score += 2
        reasons.append("alta relevância (product design)")
    elif any(s in title for s in mid_skills):
        score += 1
        reasons.append("relevância média (ux/ui)")
    # Sem match → 0 pontos de área

    # ---- SENIORIDADE (0-2 pontos) ----
    senior_kw = ["senior", "sênior", "lead", "manager", "head", "director", "coordenador",
                 "coordenadora", "gerente", "principal", "staff", "especialista"]
    junior_kw = ["junior", "júnior", "jr", "intern", "estagiário", "trainee", "pleno",
                 "pl.", "mid-level"]

    if any(j in title for j in junior_kw):
        return (1, "nível junior/pleno")

    if any(s in title for s in senior_kw):
        score += 2
        reasons.append("senior+")
    else:
        score += 2
        reasons.append("pleno/senior (assumido)")

    # ---- LOCALIZAÇÃO (0-1 ponto) ----
    is_brazil = "brazil" in loc or "brasil" in loc
    is_local = "ponta grossa" in loc or "porecatu" in loc or "paraná" in loc or "parana" in loc

    if "remote" in loc or "remoto" in loc or (is_brazil and not is_local):
        score += 1
        reasons.append("remoto/BR")
    elif is_local:
        score += 1
        reasons.append("região PG/Porecatu")
    # Fora do Brasil ou da região → 0 pontos

    # ---- SCORE → ESTRELAS ----
    if score >= 4:
        return (5, ", ".join(reasons))
    elif score >= 3:
        return (4, ", ".join(reasons))
    elif score >= 2:
        return (3, ", ".join(reasons))
    elif score >= 1:
        return (2, ", ".join(reasons))
    else:
        return (1, ", ".join(reasons) if reasons else "sem match")


def format_vaga_md(job, details):
    """Formata uma vaga como bloco markdown pro arquivo jobs.md."""
    title = job.get("title", "Vaga sem título")
    company = job.get("company", "Ver link")
    location = job.get("location", "Ver link")
    work_mode = details.get("work_mode", "")
    date_label = job.get("date_label", job.get("date", "Ver link"))
    url = job.get("url", "")
    desc = details.get("description", "")

    desc_lines = []
    for line in desc.split(". "):
        line = line.strip()
        if line and len(line) > 15:
            desc_lines.append(line)
        if len(desc_lines) >= 3:
            break
    desc_text = ". ".join(desc_lines)

    block = f"""## {title}

**Empresa:** {company}
**Local:** {location}
**Modalidade:** {work_mode or "Ver link"}
**Publicada:** {date_label}
**Link:** {url}

> {desc_text}

---"""
    return block


# ═══════════════════════════════════════════════════════════════
# MAIN — PIPELINE DE EXECUÇÃO
# ═══════════════════════════════════════════════════════════════
# 1. Carrega estado persistente (IDs, chaves, stats de keywords)
# 2. Remove keywords improdutivas (só depois de 15+ execuções)
# 3. Busca na API (2 páginas por query, paralelo com deadline)
# 4. Dedup tripla (ID + título/empresa)
# 5. Filtra por localização + nível (remove junior, remove fora do BR)
# 6. Busca detalhes em paralelo (3 threads, máx 8 vagas)
# 7. Salva estado, stats de keywords, JSON pro AjustaCV, histórico MD

def main():
    """Pipeline completo de busca e dedup de vagas do LinkedIn."""
    now = datetime.now().strftime("%d/%m/%Y %H:%M")

    # ═══ ETAPA 1: CARREGA ESTADO PERSISTENTE ═══
    seen_ids = load_seen_ids()
    seen_keys = load_seen_keys()
    md_ids = load_existing_from_md()
    all_known_ids = seen_ids | md_ids

    # ═══ ETAPA 2: KEYWORDS + PRUNING ═══
    kw_stats = load_keyword_stats()
    active_keywords = prune_keywords(KEYWORDS, kw_stats)
    searches = build_searches(active_keywords)

    deadline = time.time() + 240  # timeout total de 4 minutos

    print(f"Buscando na API Guest do LinkedIn — {now}", file=sys.stderr)
    print(f"IDs vistos: {len(all_known_ids)} | Chaves: {len(seen_keys)}", file=sys.stderr)
    print(f"Keywords ativas: {len(active_keywords)}/{len(KEYWORDS)}", file=sys.stderr)
    print(f"Queries: {len(searches)}, 2 páginas cada, deadline 240s", file=sys.stderr)

    # ═══ ETAPA 3: BUSCA NA API ═══
    all_jobs = []
    all_seen = set()

    for params in searches:
        if time.time() > deadline:
            print("Deadline global atingido — parando buscas.", file=sys.stderr)
            break

        jobs = search_jobs(params, max_pages=2, deadline=deadline)
        kw = params.get("keywords", "")
        for job in jobs:
            if job["id"] not in all_seen:
                job["source_keyword"] = kw
                job["_key"] = normalize_key(job.get("title", ""), job.get("company", ""))
                all_seen.add(job["id"])
                all_jobs.append(job)
        time.sleep(0.3)

    print(f"Total de vagas encontradas: {len(all_jobs)}", file=sys.stderr)

    # ═══ ETAPA 4: DEDUP TRIPLA ═══
    new_jobs = []
    skipped_ids = 0
    skipped_keys = 0

    for j in all_jobs:
        if j["id"] in all_known_ids:
            skipped_ids += 1
            continue

        key = j.get("_key") or normalize_key(j.get("title", ""), j.get("company", ""))
        if key in seen_keys:
            skipped_keys += 1
            continue

        new_jobs.append(j)

    print(f"Dedup: {skipped_ids} por ID + {skipped_keys} por título+empresa", file=sys.stderr)
    print(f"Vagas novas: {len(new_jobs)}", file=sys.stderr)

    # ═══ ETAPA 5: FILTRO POR LOCALIZAÇÃO E NÍVEL ═══
    filtered = []
    for job in new_jobs:
        loc = job.get("location", "").lower()
        title = job.get("title", "").lower()

        skip = False
        for kw in ["junior", "júnior", "jr", "intern", "estagiário", "trainee"]:
            if kw in title:
                skip = True
                break
        if skip:
            continue

        is_brazil = "brazil" in loc or "brasil" in loc or "paraná" in loc or "parana" in loc
        if not is_brazil:
            continue

        filtered.append(job)

    print(f"Após filtro de local+nível: {len(filtered)}", file=sys.stderr)

    if not filtered:
        for params in searches:
            kw = params.get("keywords", "")
            update_keyword_stats(kw_stats, kw, 0)
        save_keyword_stats(kw_stats)
        print(f"Nenhuma vaga nova — {now}")
        return

    # ═══ ETAPA 6: BUSCA DETALHES EM PARALELO ═══
    MAX_DETAIL = 8
    jobs_to_fetch = filtered[:MAX_DETAIL]

    def fetch_one(job):
        """Busca detalhes de UMA vaga e aplica os filtros finais."""
        if time.time() > deadline:
            return None

        job_id = job.get("id")
        if not job_id:
            print(f"Pulando vaga sem ID: {job.get('title', '?')}", file=sys.stderr)
            return None

        details = get_job_details(job_id)

        if details.get("closed"):
            print(f"Pulando vaga encerrada: {job['title']}", file=sys.stderr)
            return None

        work_mode = details.get("work_mode", "")
        if work_mode.lower() in ("on-site", "presencial"):
            loc_lower = job.get("location", "").lower()
            is_local = "ponta grossa" in loc_lower or "porecatu" in loc_lower
            if not is_local:
                print(f"Pulando vaga presencial fora da região: {job['title']} — {job['location']}", file=sys.stderr)
                return None

        return (job, details)

    enriched = []
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(fetch_one, job): job for job in jobs_to_fetch}
        for future in as_completed(futures):
            if time.time() > deadline:
                for f in futures:
                    f.cancel()
                print("Deadline atingido durante busca de detalhes — parando.", file=sys.stderr)
                break
            result = future.result()
            if result:
                enriched.append(result)

    if not enriched:
        print(f"Nenhuma vaga nova (todas encerradas) — {now}")
        JOBS_JSON.write_text("[]", encoding="utf-8")
        return

    # ═══ ETAPA 7: SALVA ESTADO E GERA SAÍDAS ═══

    # --- 7a. Atualiza SEEN_JSON com IDs e chaves das vagas enriquecidas ---
    new_ids_to_mark = set()
    new_keys_to_mark = set()
    for job, details in enriched:
        new_ids_to_mark.add(job["id"])
        new_keys_to_mark.add(job.get("_key") or normalize_key(job.get("title", ""), job.get("company", "")))

    save_full_state(seen_ids, seen_keys, new_ids_to_mark, new_keys_to_mark)
    print(f"SEEN_JSON atualizado: +{len(new_ids_to_mark)} IDs, +{len(new_keys_to_mark)} chaves", file=sys.stderr)

    # --- 7b. Atualiza stats de keywords com o yield desta execução ---
    kw_yield = {}
    for j in filtered:
        sk = j.get("source_keyword", "")
        if sk:
            kw_yield[sk] = kw_yield.get(sk, 0) + 1

    for kw, count in kw_yield.items():
        update_keyword_stats(kw_stats, kw, count)

    for params in searches:
        kw = params.get("keywords", "")
        if kw not in kw_yield:
            update_keyword_stats(kw_stats, kw, 0)

    save_keyword_stats(kw_stats)

    # --- 7c. Gera o JSON que o AjustaCV vai importar ---
    jobs_for_agent = []
    for job, details in enriched:
        h_score, h_reason = heuristic_score(job)
        jobs_for_agent.append({
            "id": job["id"],
            "title": job.get("title", ""),
            "company": job.get("company", ""),
            "location": job.get("location", ""),
            "work_mode": details.get("work_mode", ""),
            "date_label": job.get("date_label", ""),
            "url": job.get("url", ""),
            "description": details.get("description", ""),
            "heuristic_score": h_score,
            "heuristic_reason": h_reason,
        })

    JOBS_JSON.write_text(json.dumps(jobs_for_agent, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"JSON salvo: {len(jobs_for_agent)} vagas pra importar no AjustaCV", file=sys.stderr)

    # --- 7d. Atualiza histórico MD (só acrescenta, nunca remove) ---
    vagas_md = []
    for job, details in enriched:
        block = format_vaga_md(job, details)
        vagas_md.append(block)

    header = f"""# Vagas do LinkedIn — {USER_NAME}

> Última atualização: {now}
> Filtros: Remoto (Brasil) / Híbrido+Presencial (Ponta Grossa/Porecatu) | Pleno/Senior+ | Máx 1 mês | Via API Guest do LinkedIn

---"""

    try:
        current = VAGAS_FILE.read_text(encoding="utf-8")
        if current.startswith("# Vagas do LinkedIn"):
            parts = current.split("---", 1)
            rest = parts[1] if len(parts) > 1 else ""
        else:
            rest = current
    except FileNotFoundError:
        rest = ""

    new_content = header + "\n\n" + "\n\n".join(vagas_md) + rest
    VAGAS_FILE.write_text(new_content, encoding="utf-8")

    print(f"✅ {len(enriched)} vaga(s) coletada(s) — {now}")


if __name__ == "__main__":
    main()
