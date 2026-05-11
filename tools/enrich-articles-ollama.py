#!/usr/bin/env python3
"""
Enrich StockCrawler news JSON via local Ollama for article submission.

This script keeps the StockCrawler root shape and overwrites per-article fields
so the output can be passed directly to `tools/submit-article`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

_TOOLS_DIR = Path(__file__).resolve().parent
if str(_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOLS_DIR))

import article_submit_lib as lib

DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_OLLAMA_MODEL = "vanilj/palmyra-fin-70b-32k:latest"


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _normalize_tags(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    seen: set[str] = set()
    out: list[str] = []
    for raw in value:
        tag = _clean_text(raw)
        if not tag:
            continue
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(tag[:64])
    return out


def _normalize_slug(value: Any) -> str:
    slug = _clean_text(value).lower()
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug[:255]


def _normalize_catalyst(value: Any) -> str:
    token = _clean_text(value).lower()
    if token == "bullish":
        return "Bullish"
    if token == "bearish":
        return "Bearish"
    return ""


def _parse_llm_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        raise ValueError("Empty Ollama response content.")
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        raise ValueError("Ollama response did not contain JSON object.")
    parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("Parsed Ollama response JSON is not an object.")
    return parsed


def _article_prompt(news: dict[str, Any], symbol: str) -> tuple[str, str]:
    source_payload = {
        "symbol": symbol,
        "headline": _clean_text(news.get("headline")),
        "summary": _clean_text(news.get("summary")),
        "content": _clean_text(news.get("content")),
        "source": _clean_text(news.get("source")),
        "url": _clean_text(news.get("url")),
        "tags": _normalize_tags(news.get("tags")),
        "symbols": _normalize_tags(news.get("symbols")),
    }
    system = (
        "You are a finance news enrichment assistant.\n"
        "Return strict JSON only with keys:\n"
        "reworded_title, reworded_summary, reworded_content, tags, "
        "section_slug, seo_title, seo_description, catalyst_sentiment.\n"
        "Rules:\n"
        "1) Rewrite title/summary/content in original meaning but different wording.\n"
        "2) tags must be a short array (3-8) of lowercase or title-case topic tags.\n"
        "3) section_slug should be one slug suitable for taxonomy section.\n"
        "4) seo_title should be concise, max ~60 chars.\n"
        "5) seo_description should be concise, max ~160 chars.\n"
        "6) catalyst_sentiment must be exactly one of: bullish, bearish, neutral.\n"
        "7) Do not include markdown fences or extra keys."
    )
    user = (
        "Enrich this finance article JSON:\n"
        f"{json.dumps(source_payload, ensure_ascii=True)}"
    )
    return system, user


def _ollama_chat(
    *,
    base_url: str,
    model: str,
    timeout: float,
    system_prompt: str,
    user_prompt: str,
) -> dict[str, Any]:
    endpoint = f"{base_url.rstrip('/')}/api/chat"
    body = {
        "model": model,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Ollama HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Ollama request failed: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("Ollama returned non-JSON response.") from exc

    message = payload.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not content:
        raise RuntimeError("Ollama response missing message.content.")
    return _parse_llm_json(str(content))


def _apply_enrichment(
    *,
    news: dict[str, Any],
    generated: dict[str, Any],
    section_override: str | None,
) -> None:
    title = _clean_text(generated.get("reworded_title")) or _clean_text(news.get("headline"))
    summary = _clean_text(generated.get("reworded_summary")) or _clean_text(news.get("summary"))
    content = _clean_text(generated.get("reworded_content")) or _clean_text(news.get("content"))
    tags = _normalize_tags(generated.get("tags")) or _normalize_tags(news.get("tags"))
    section_slug = (
        _normalize_slug(generated.get("section_slug"))
        or _normalize_slug(section_override)
        or _normalize_slug(news.get("section_slug"))
    )
    seo_title = _clean_text(generated.get("seo_title"))[:120]
    seo_description = _clean_text(generated.get("seo_description"))[:255]
    catalyst = _normalize_catalyst(generated.get("catalyst_sentiment"))

    news["headline"] = title
    news["summary"] = summary
    news["content"] = content
    news["tags"] = tags
    if section_slug:
        news["section_slug"] = section_slug
    news["seo_title"] = seo_title
    news["seo_description"] = seo_description
    if catalyst:
        news["catalyst"] = catalyst
    else:
        news.pop("catalyst", None)


def _enrich_root(
    *,
    root: dict[str, Any],
    base_url: str,
    model: str,
    timeout: float,
    retries: int,
    retry_delay: float,
    section_override: str | None,
) -> dict[str, Any]:
    total = enriched = failed = 0
    for block in root.get("tickers") or []:
        if not isinstance(block, dict):
            continue
        symbol = _clean_text(block.get("symbol")).upper()
        for news in block.get("alpacNews") or []:
            if not isinstance(news, dict):
                continue
            total += 1
            system_prompt, user_prompt = _article_prompt(news, symbol)
            last_error = ""
            for attempt in range(retries + 1):
                try:
                    generated = _ollama_chat(
                        base_url=base_url,
                        model=model,
                        timeout=timeout,
                        system_prompt=system_prompt,
                        user_prompt=user_prompt,
                    )
                    _apply_enrichment(
                        news=news,
                        generated=generated,
                        section_override=section_override,
                    )
                    enriched += 1
                    last_error = ""
                    break
                except Exception as exc:  # pragma: no cover - defensive
                    last_error = str(exc)
                    if attempt < retries:
                        time.sleep(retry_delay)
            if last_error:
                failed += 1
                news.pop("catalyst", None)
                news["enrichment_error"] = last_error

    root["ollama_enrichment"] = {
        "model": model,
        "base_url": base_url,
        "total_articles": total,
        "enriched": enriched,
        "failed": failed,
    }
    return root


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Rewrite and enrich StockCrawler news JSON via local Ollama.",
    )
    parser.add_argument("--input-file", required=True, help="Path to StockCrawler JSON input.")
    parser.add_argument("--output-file", required=True, help="Path to write enriched JSON output.")
    parser.add_argument(
        "--ollama-base-url",
        default=os.environ.get("OLLAMA_BASE_URL", DEFAULT_OLLAMA_BASE_URL),
        help="Ollama base URL (default: OLLAMA_BASE_URL env or http://127.0.0.1:11434).",
    )
    parser.add_argument(
        "--ollama-model",
        default=os.environ.get("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL),
        help="Ollama model (default: OLLAMA_MODEL env or vanilj/palmyra-fin-70b-32k:latest).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=float(os.environ.get("OLLAMA_TIMEOUT", "120")),
        help="Ollama request timeout in seconds.",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=int(os.environ.get("OLLAMA_RETRIES", "1")),
        help="Per-article retry attempts after initial request.",
    )
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=float(os.environ.get("OLLAMA_RETRY_DELAY", "1.0")),
        help="Delay in seconds between retry attempts.",
    )
    parser.add_argument(
        "--section-slug",
        default=None,
        help="Optional section slug override applied when LLM section is missing.",
    )
    args = parser.parse_args(argv)

    lib.load_repo_env()

    input_path = Path(args.input_file)
    output_path = Path(args.output_file)
    if not input_path.is_file():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 2

    try:
        root = json.loads(input_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON in {input_path}: {exc}", file=sys.stderr)
        return 2
    if not isinstance(root, dict):
        print("StockCrawler JSON root must be an object.", file=sys.stderr)
        return 2

    enriched = _enrich_root(
        root=root,
        base_url=args.ollama_base_url.strip() or DEFAULT_OLLAMA_BASE_URL,
        model=args.ollama_model.strip() or DEFAULT_OLLAMA_MODEL,
        timeout=max(1.0, float(args.timeout)),
        retries=max(0, int(args.retries)),
        retry_delay=max(0.0, float(args.retry_delay)),
        section_override=(args.section_slug or "").strip() or None,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(enriched, ensure_ascii=True, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "input_file": str(input_path),
                "output_file": str(output_path),
                "summary": enriched.get("ollama_enrichment", {}),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
