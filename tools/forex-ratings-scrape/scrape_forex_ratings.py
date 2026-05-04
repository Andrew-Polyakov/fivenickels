#!/usr/bin/env python3
"""Fetch and parse the Forex-Ratings.com forex-brokers directory table."""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

SOURCE_URL = "https://www.forex-ratings.com/forex-brokers/"
BASE_HOST = "https://www.forex-ratings.com"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def extract_review_count(reviews_td) -> int | None:
    if not reviews_td:
        return None
    link = reviews_td.find("a", href=lambda h: h and "/forex-reviews/" in h)
    if not link:
        return None
    badge = link.find("span", class_=lambda c: c and "badge" in str(c) and "bg-secondary" in str(c))
    if badge:
        text = badge.get_text(strip=True)
        m = re.search(r"\d+", text)
        if m:
            return int(m.group())
    m = re.search(r"\d+", reviews_td.get_text())
    return int(m.group()) if m else None


def parse_broker_row(tr) -> dict | None:
    th = tr.find("th")
    if not th:
        return None
    rank_el = th.find("span", class_="badge")
    if not rank_el:
        return None
    try:
        rank = int(rank_el.get_text(strip=True))
    except ValueError:
        return None

    tds = tr.find_all("td", recursive=False)
    if len(tds) < 7:
        tds = tr.find_all("td")
    if len(tds) < 7:
        return None

    name_link = tds[1].find("a", class_="rating-link")
    if not name_link:
        name_link = tds[1].find("a", href=re.compile(r"/forex-brokers/"))
    if not name_link:
        return None

    href = name_link.get("href") or ""
    m = re.search(r"/forex-brokers/([^/]+)/?", href)
    slug = m.group(1) if m else None
    name = name_link.get_text(strip=True)

    year_text = tds[2].get_text(strip=True)
    year_founded = int(year_text) if re.fullmatch(r"\d{4}", year_text) else None

    status = None
    status_badge = tds[3].find("span", class_="badge")
    if status_badge:
        status = status_badge.get_text(strip=True)

    review_count = extract_review_count(tds[4])

    types_raw = tds[5].get_text(strip=True)
    broker_types = [t.strip() for t in types_raw.split(",") if t.strip()]

    regulation = tds[6].get_text(strip=True) or None

    reviews_link = tds[4].find("a", href=lambda h: h and "/forex-reviews/" in h)
    reviews_path = reviews_link.get("href") if reviews_link else None
    urls = {
        "broker": urljoin(BASE_HOST, f"/forex-brokers/{slug}/") if slug else None,
        "reviews": urljoin(BASE_HOST, reviews_path) if reviews_path else None,
    }

    return {
        "rank": rank,
        "name": name,
        "slug": slug,
        "yearFounded": year_founded,
        "status": status,
        "reviewCount": review_count,
        "brokerTypes": broker_types,
        "regulation": regulation,
        "urls": urls,
    }


def scrape(html: str) -> tuple[list[dict], list[dict]]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("table.table.align-middle")
    if not table:
        raise RuntimeError("Could not find broker directory table")

    rows: list[dict] = []
    kept_slug_rank: dict[str, int] = {}
    duplicate_skipped: list[dict] = []

    for tr in table.find_all("tr"):
        item = parse_broker_row(tr)
        if not item or not item.get("slug"):
            continue
        slug = item["slug"]
        if slug in kept_slug_rank:
            duplicate_skipped.append(
                {
                    "slug": slug,
                    "skippedRank": item["rank"],
                    "keptRank": kept_slug_rank[slug],
                }
            )
            continue
        kept_slug_rank[slug] = item["rank"]
        rows.append(item)

    rows.sort(key=lambda x: x["rank"])
    return rows, duplicate_skipped


def fetch_html(url: str, timeout: float = 60.0) -> str:
    r = requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
        timeout=timeout,
    )
    r.raise_for_status()
    r.encoding = r.apparent_encoding or "utf-8"
    return r.text


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--output",
        "-o",
        type=Path,
        default=Path("brokers/forex-ratings.com.json"),
        help="Output JSON path (default: brokers/forex-ratings.com.json)",
    )
    ap.add_argument(
        "--html-file",
        type=Path,
        default=None,
        help="Parse local HTML instead of fetching (for debugging)",
    )
    args = ap.parse_args()

    if args.html_file:
        html = args.html_file.read_text(encoding="utf-8", errors="replace")
    else:
        html = fetch_html(SOURCE_URL)

    brokers, duplicate_skipped = scrape(html)
    scraped_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out = {
        "source": SOURCE_URL,
        "scrapedAt": scraped_at,
        "stats": {
            "parsedTableRows": len(brokers) + len(duplicate_skipped),
            "brokerRecords": len(brokers),
            "duplicateSlugRowsSkipped": duplicate_skipped,
        },
        "brokers": brokers,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(brokers)} brokers to {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
