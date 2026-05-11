---
name: articles-enrichment
description: >-
  Crawls Alpaca news with StockCrawler, enriches each story via local Ollama using configurable prompts, submits
  draft articles to Wigtail for profile moderation, and surfaces edit links for review. Use when the user asks to
  enrich news into articles, run rewriteNews, auto-submit imported stories, load the moderation queue, or run the
  crawl → LLM → submit pipeline.
---

# Articles enrichment (crawl → Ollama → moderation)

## Outcome

- **Live run:** new `TaggedContentPage` drafts with `awaiting_moderation=True` (not published).
- **Review:** staff open **`/profile/`** moderation queue or **`/profile/article/<id>/edit/`** per created article.
- **Artifacts:** crawl and enriched JSON under `reports/pipeline-artifacts/<timestamp>-<tickers>/` (`crawl.json`, `enriched.json`). Keep for inspection; do not delete unless the user asks.

## Prerequisites

1. **Alpaca credentials** for StockCrawler (`.apca`, `alpacacredentials`, or repo `.env`; `ALPACA_ENV=paper|live` must match the key).
2. **Ollama** reachable at `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`) with `OLLAMA_MODEL` pulled locally.
3. **Wigtail** running and reachable at `WIGTAIL_ARTICLE_SUBMIT_URL` (default `http://127.0.0.1:8000/api/articles/auto-submit/`).
4. **Submit auth** in repo `.env`: `ARTICLE_SUBMIT_BEARER_TOKEN` (same value as Wagtail `ARTICLE_SUBMIT_BEARER_TOKEN`). Optional: `ARTICLE_SUBMIT_DEFAULT_SECTION_SLUG`, `ARTICLE_SUBMIT_DEFAULT_AUTHOR_NAME`, `ARTICLE_SUBMIT_USER`.
5. **Prompts:** `config/ollama-enrichment-prompts.json` (`system`, `user` templates with `{taxonomy_rules}` and `{article_json}`). Override with `OLLAMA_ENRICHMENT_PROMPTS_FILE`, `OLLAMA_ENRICHMENT_SYSTEM_PROMPT`, or `OLLAMA_ENRICHMENT_USER_PROMPT`, or CLI `--ollama-prompts-file` / `--prompts-file`.

## Default command (enrichment always on)

From repo root:

```bash
# Windows
tools\rewriteNews.bat TICKER1 TICKER2

# macOS/Linux
tools/rewriteNews.sh TICKER1 TICKER2
```

Equivalent:

```bash
python tools/pipeline.py --enrich-ollama TICKER1 TICKER2
```

`rewriteNews` bootstraps submit-related `.env` keys, then runs `pipeline.py` with `--enrich-ollama`.

## Pipeline steps (agent)

Copy and track:

```text
Task progress:
- [ ] Confirm Alpaca, Ollama, Wagtail, and submit token
- [ ] Confirm prompt config (config/ollama-enrichment-prompts.json or overrides)
- [ ] Dry-run pipeline for requested tickers
- [ ] Review enriched.json and dry-run submit payload
- [ ] Live submit (omit --dry-run)
- [ ] Open profile moderation and report created ids / edit URLs
```

1. **Crawl news** — StockCrawler `news` mode (`tools/stock-crawler` or `dotnet run --project tools/StockCrawler -- news …`). Writes `crawl.json`.
2. **Enrich** — `tools/enrich-articles-ollama.py` calls Ollama `/api/chat` with `format: json`, maps fields to submit shape (`headline`, `summary`, `content`, `tags`, `section_slug`, `seo_title`, `seo_description`, `catalyst` as `Bullish`/`Bearish` or omitted for neutral). Writes `enriched.json`.
3. **Submit** — `tools/submit-article` POSTs to auto-submit API. Creates drafts, sets `awaiting_moderation`, dedupes by `canonical_url`.

## Useful flags

Pass through `rewriteNews` / `pipeline.py`:

| Flag | Purpose |
|------|---------|
| `--dry-run` | Crawl + enrich + map articles; no Wigtail POST |
| `--ollama-model MODEL` | Override `OLLAMA_MODEL` |
| `--ollama-base-url URL` | Override `OLLAMA_BASE_URL` |
| `--ollama-prompts-file PATH` | Override prompt JSON for this run |
| `--section-slug SLUG` | Fallback taxonomy section when LLM slug is empty |
| `--keep-json PATH` | Fixed crawl path; enriched sibling `*.enriched.json` |

Enrich-only tuning: `--ollama-timeout`, `--ollama-retries`, `--ollama-retry-delay`.

## Dry-run then live

1. **Dry-run:** `tools\rewriteNews.bat NVDA --dry-run` (or `python tools/pipeline.py --enrich-ollama --dry-run NVDA`).
2. Read stdout JSON: `artifacts`, `submit_summary.articles` (mapped payloads), `ollama_enrichment` inside `enriched.json`.
3. Fix prompts or env if enrichment errors appear on items (`enrichment_error` on a story).
4. **Live:** rerun the same tickers **without** `--dry-run`.
5. On success, `submit_summary.results[]` includes `id`, `slug`, `canonical_url` for `status: "created"`; `skipped` when `canonical_url` already exists.

Non-zero exit: `crawl_exit`, `enrich_exit`, or submit failures in `submit_summary.failed`.

## Moderation handoff

- Auto-submit creates **draft** pages (`live=False`) with **`awaiting_moderation=True`** (`wigtail/home/article_auto_submit.py`).
- Staff **profile** at **`/profile/`** lists moderation items (`moderation_data`: title, section, preview, catalyst, `edit_url`, `approve_url`).
- **Edit:** `http://127.0.0.1:8000/profile/article/<id>/edit/` (match running host). Editor loads `/api/articles/<id>/`; save PATCH; catalyst toggle and taxonomy in the shadcn editor.
- **Approve / publish:** moderation UI or `POST /api/articles/<id>/action/` with `approve_moderation` (or editor actions). Do not publish without user intent.

After live submit, tell the user: artifact folder path, created/skipped/failed counts, and direct **edit** links for new ids.

## Prompt contract (do not break silently)

LLM JSON keys expected by enrichment: `reworded_title`, `reworded_summary`, `reworded_content`, `tags`, `section_slug`, `seo_title`, `seo_description`, `catalyst_sentiment` (`bullish` / `bearish` / `neutral`). `{taxonomy_rules}` is filled from `tools/taxonomy_catalog.py` at runtime. Post-processing maps near-miss section slugs and normalizes catalyst before submit.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Crawl fails | Alpaca keys, `ALPACA_ENV`, network |
| Enrich fails / timeouts | Ollama up, model name, raise `--ollama-timeout` / retries |
| Submit 403 | `ARTICLE_SUBMIT_BEARER_TOKEN` matches Wagtail |
| Submit 4xx on items | Wagtail logs; DB migrations (`catalyst`, moderation fields) |
| Duplicate skipped | Same `canonical_url` already imported |
| Editor missing fields | Rebuild `front-end` bundle; hard-refresh edit page |

## Code map

- `tools/pipeline.py` — orchestration, artifacts
- `tools/enrich-articles-ollama.py` — Ollama enrichment
- `tools/ollama_enrichment_config.py` — prompt loading
- `config/ollama-enrichment-prompts.json` — default prompts
- `tools/submit-article` — Wigtail auto-submit client
- `wigtail/home/article_auto_submit.py` — draft + moderation queue
