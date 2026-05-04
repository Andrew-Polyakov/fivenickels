#!/usr/bin/env python3
"""
Build brokers/stocks-world.json from Wikipedia Template:Online brokerages
and optional Forex-Ratings stock-broker articles (H2 headings).

Requires Python 3.10+. Dependencies: requests, beautifulsoup4 (see requirements.txt).

Usage:
  python build_stocks_world.py
  python build_stocks_world.py --no-forex-ratings   # Wikipedia only
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "brokers" / "stocks-world.json"

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_TEMPLATE_TITLE = "Template:Online brokerages"
WIKI_LICENSE_NOTE = (
    "Wikipedia content is licensed under CC BY-SA 4.0; "
    "https://creativecommons.org/licenses/by-sa/4.0/"
)

REGION_ORDER = [
    "Canada",
    "India",
    "United States",
    "Europe",
    "Asia",
    "Elsewhere",
]

# Headings on Forex-Ratings articles that are section boilerplate, not firm names.
_FOREX_RATINGS_SKIP_H2: frozenset[str] = frozenset(
    {
        "bottom line",
        "our verdict",
        "pros",
        "cons",
        "conclusion",
        "summary",
        "introduction",
        "references",
        "editors picks",
        "stock brokers",
    }
)

FOREX_RATINGS_ARTICLES: list[str] = [
    "https://www.forex-ratings.com/stock-brokers/best-international-stock-brokers/",
    "https://www.forex-ratings.com/stock-brokers/best-us-stock-brokers/",
    "https://www.forex-ratings.com/stock-brokers/best-asian-stock-brokers/",
]

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def normalize_key(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^\w\s]", "", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s)
    return s


def wiki_encode_title(title: str) -> str:
    """Path segment for /wiki/ URL (spaces -> underscores)."""
    return quote(title.replace(" ", "_"), safe="/():%'")


def fetch_wikitext(title: str) -> str:
    params = {
        "action": "query",
        "titles": title,
        "prop": "revisions",
        "rvprop": "content",
        "rvslots": "main",
        "format": "json",
        "formatversion": "2",
    }
    r = requests.get(
        WIKI_API,
        params=params,
        headers={"User-Agent": USER_AGENT},
        timeout=60,
    )
    r.raise_for_status()
    data = r.json()
    pages = data.get("query", {}).get("pages", [])
    if not pages:
        raise RuntimeError("No pages in Wikipedia API response")
    revs = pages[0].get("revisions")
    if not revs:
        raise RuntimeError("No revisions for template page")
    content = revs[0].get("slots", {}).get("main", {}).get("content")
    if content is None:
        content = revs[0].get("content")  # older API shape
    if not content:
        raise RuntimeError("Empty wikitext")
    return content


LINK_LINE_RE = re.compile(
    r"^\*{1,2}\s*\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]\s*$",
)
GROUP_REGION_RE = re.compile(
    r"^\|\s*group\d+\s*=\s*(Canada|India|United States|Europe|Asia|Elsewhere)\s*$",
)


def parse_wikipedia_online_brokerages(wikitext: str) -> list[dict[str, Any]]:
    """Parse Template:Online brokerages subgroup lists into broker records."""
    wikitext = re.sub(r"<noinclude>.*?</noinclude>", "", wikitext, flags=re.DOTALL)

    lines = wikitext.splitlines()
    try:
        start = next(i for i, ln in enumerate(lines) if "{{Navbox|subgroup" in ln)
    except StopIteration:
        raise RuntimeError("Could not find {{Navbox|subgroup in template")

    concepts_idx = None
    for i, ln in enumerate(lines):
        if "Concepts" in ln and re.search(r"\|\s*group\d+\s*=\s*Concepts", ln):
            concepts_idx = i
            break
    if concepts_idx is None:
        raise RuntimeError("Could not find |groupN = Concepts line")

    end = None
    for k in range(concepts_idx - 1, start, -1):
        if lines[k].strip() == "}}":
            end = k
            break
    if end is None:
        raise RuntimeError("Could not find closing }} before Concepts section")

    section = lines[start : end + 1]
    brokers: list[dict[str, Any]] = []
    current_region: str | None = None

    for ln in section:
        gr = GROUP_REGION_RE.match(ln.strip())
        if gr:
            current_region = gr.group(1)
            continue
        m = LINK_LINE_RE.match(ln.strip())
        if m and current_region:
            page_title = m.group(1).strip()
            display = (m.group(2) or page_title).strip()
            # Normalize underscores from wiki -> spaces for title storage
            page_title = page_title.replace("_", " ")
            wiki_url = f"https://en.wikipedia.org/wiki/{wiki_encode_title(page_title)}"
            brokers.append(
                {
                    "name": display,
                    "regions": [current_region],
                    "wikipediaTitle": page_title,
                    "wikipediaUrl": wiki_url,
                    "sourceTags": ["wikipedia-template"],
                }
            )

    return brokers


def fetch_forex_ratings_h2_names(url: str) -> list[str]:
    r = requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html"},
        timeout=60,
    )
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    names: list[str] = []
    for h2 in soup.find_all("h2"):
        # Skip empty / navigation
        text = h2.get_text(strip=True)
        if not text or len(text) > 120:
            continue
        # Often "[Author]" or empty edit sections — drop common junk
        low = text.lower()
        if low.startswith("written by") or "cookie" in low:
            continue
        # Wikipedia-style [edit] noise sometimes appended
        text = re.sub(r"\s*\[edit\]\s*$", "", text, flags=re.I).strip()
        if not text or normalize_key(text) in _FOREX_RATINGS_SKIP_H2:
            continue
        if text not in names:
            names.append(text)
    return names


def merge_records(
    wiki_brokers: list[dict[str, Any]],
    fr_urls: list[str],
) -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}

    for b in wiki_brokers:
        k = normalize_key(b["name"])
        if k not in by_key:
            by_key[k] = {
                "name": b["name"],
                "regions": list(b["regions"]),
                "wikipediaTitle": b.get("wikipediaTitle"),
                "wikipediaUrl": b.get("wikipediaUrl"),
                "sourceTags": list(b["sourceTags"]),
            }
        else:
            # Same normalized key: merge regions and tags
            ob = by_key[k]
            for reg in b["regions"]:
                if reg not in ob["regions"]:
                    ob["regions"].append(reg)
            for t in b["sourceTags"]:
                if t not in ob["sourceTags"]:
                    ob["sourceTags"].append(t)

    for article_url in fr_urls:
        try:
            h2_names = fetch_forex_ratings_h2_names(article_url)
        except Exception as e:
            print(f"Warning: could not fetch {article_url}: {e}", file=sys.stderr)
            continue
        for raw_name in h2_names:
            k = normalize_key(raw_name)
            if not k:
                continue
            if k not in by_key:
                by_key[k] = {
                    "name": raw_name,
                    "regions": [],
                    "wikipediaTitle": None,
                    "wikipediaUrl": None,
                    "sourceTags": ["forex-ratings-article"],
                    "forexRatingsArticles": [article_url],
                }
            else:
                ob = by_key[k]
                if "forex-ratings-article" not in ob["sourceTags"]:
                    ob["sourceTags"].append("forex-ratings-article")
                ob.setdefault("forexRatingsArticles", [])
                if article_url not in ob["forexRatingsArticles"]:
                    ob["forexRatingsArticles"].append(article_url)

    # Sort regions within each broker for stability
    region_rank = {r: i for i, r in enumerate(REGION_ORDER)}

    def sort_key(item: tuple[str, dict[str, Any]]) -> tuple[Any, ...]:
        _, rec = item
        regs = rec.get("regions") or []
        primary = min((region_rank[r] for r in regs if r in region_rank), default=999)
        return (primary, rec["name"].lower())

    merged = [rec for _, rec in sorted(by_key.items(), key=sort_key)]
    for rec in merged:
        if rec.get("regions"):
            rec["regions"] = sorted(
                rec["regions"],
                key=lambda r: region_rank.get(r, 99),
            )
    return merged


def main() -> int:
    parser = argparse.ArgumentParser(description="Build brokers/stocks-world.json")
    parser.add_argument(
        "--no-forex-ratings",
        action="store_true",
        help="Skip Forex-Ratings article scraping",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUT_PATH,
        help=f"Output JSON path (default: {OUT_PATH})",
    )
    args = parser.parse_args()

    print("Fetching Wikipedia template wikitext...")
    wikitext = fetch_wikitext(WIKI_TEMPLATE_TITLE)
    wiki_brokers = parse_wikipedia_online_brokerages(wikitext)
    print(f"  Parsed {len(wiki_brokers)} rows from Wikipedia template")

    fr_urls: list[str] = [] if args.no_forex_ratings else list(FOREX_RATINGS_ARTICLES)
    if fr_urls:
        print(f"Merging {len(fr_urls)} Forex-Ratings article(s)...")

    merged = merge_records(wiki_brokers, fr_urls)

    compiled_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out: dict[str, Any] = {
        "meta": {
            "compiledAt": compiled_at,
            "brokerCount": len(merged),
            "notes": (
                "Curated retail/online stock brokerages from Wikipedia "
                "Template:Online brokerages; optional supplement from Forex-Ratings "
                "editorial stock-broker articles. Not exhaustive and not a legal registry."
            ),
            "licenseNote": WIKI_LICENSE_NOTE,
            "sources": [
                {
                    "name": "Wikipedia — Template:Online brokerages",
                    "url": "https://en.wikipedia.org/wiki/Template:Online_brokerages",
                    "retrievalMethod": "MediaWiki Action API (revslots/wikitext)",
                },
            ],
        },
        "brokers": merged,
    }

    if fr_urls:
        out["meta"]["sources"].append(
            {
                "name": "Forex-Ratings — stock broker editorial articles",
                "url": "https://www.forex-ratings.com/stock-brokers/",
                "retrievalMethod": "HTTP GET + HTML h2 headings",
                "articleUrls": fr_urls,
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Wrote {len(merged)} brokers to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
