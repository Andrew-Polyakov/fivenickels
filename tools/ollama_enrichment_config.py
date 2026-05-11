"""Configurable Ollama prompts for StockCrawler article enrichment."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

import article_submit_lib as lib

DEFAULT_PROMPTS_FILE = lib.repo_root() / "config" / "ollama-enrichment-prompts.json"
ENV_PROMPTS_FILE = "OLLAMA_ENRICHMENT_PROMPTS_FILE"
ENV_SYSTEM_PROMPT = "OLLAMA_ENRICHMENT_SYSTEM_PROMPT"
ENV_USER_PROMPT = "OLLAMA_ENRICHMENT_USER_PROMPT"


def default_system_template() -> str:
    return (
        "You are a finance news enrichment assistant.\n"
        "Return strict JSON only with keys:\n"
        "reworded_title, reworded_summary, reworded_content, tags, "
        "section_slug, seo_title, seo_description, catalyst_sentiment.\n"
        "Rules:\n"
        "1) Rewrite title/summary/content in original meaning but different wording.\n"
        "2) tags must be a short array (3-8) of lowercase or title-case topic tags.\n"
        "3) section_slug must be one existing slug from the taxonomy list below, "
        "or a new lowercase hyphenated slug only when no existing slug is close enough.\n"
        "{taxonomy_rules}\n"
        "4) seo_title should be concise, max ~60 chars.\n"
        "5) seo_description should be concise, max ~160 chars.\n"
        "6) catalyst_sentiment must be exactly one of: bullish, bearish, neutral.\n"
        "7) Do not include markdown fences or extra keys."
    )


def default_user_template() -> str:
    return "Enrich this finance article JSON:\n{article_json}"


@dataclass(frozen=True)
class OllamaEnrichmentPrompts:
    system_template: str
    user_template: str

    def render_system(self, *, taxonomy_rules: str) -> str:
        return self.system_template.replace("{taxonomy_rules}", taxonomy_rules)

    def render_user(self, *, article_json: str) -> str:
        return self.user_template.replace("{article_json}", article_json)


def default_prompts() -> OllamaEnrichmentPrompts:
    return OllamaEnrichmentPrompts(
        system_template=default_system_template(),
        user_template=default_user_template(),
    )


def _load_prompts_file(path: Path) -> dict[str, str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Prompt config must be a JSON object: {path}")
    out: dict[str, str] = {}
    for key in ("system", "system_prompt", "user", "user_prompt"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            normalized = key.replace("_prompt", "")
            out[normalized] = value
    return out


def resolve_ollama_prompts(
    *,
    prompts_file: str | Path | None = None,
    env: Mapping[str, str] | None = None,
) -> OllamaEnrichmentPrompts:
    env_map = env if env is not None else os.environ
    prompts = default_prompts()
    system_template = prompts.system_template
    user_template = prompts.user_template

    file_candidate = prompts_file or env_map.get(ENV_PROMPTS_FILE) or ""
    file_value = str(file_candidate).strip()
    if file_value:
        loaded = _load_prompts_file(Path(file_value))
        system_template = loaded.get("system", system_template)
        user_template = loaded.get("user", user_template)
    elif DEFAULT_PROMPTS_FILE.is_file():
        loaded = _load_prompts_file(DEFAULT_PROMPTS_FILE)
        system_template = loaded.get("system", system_template)
        user_template = loaded.get("user", user_template)

    env_system = (env_map.get(ENV_SYSTEM_PROMPT) or "").strip()
    if env_system:
        system_template = env_system

    env_user = (env_map.get(ENV_USER_PROMPT) or "").strip()
    if env_user:
        user_template = env_user

    return OllamaEnrichmentPrompts(
        system_template=system_template,
        user_template=user_template,
    )
