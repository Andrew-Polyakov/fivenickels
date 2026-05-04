#!/usr/bin/env python3
"""
Harvest FX Empire CFD broker filter data (all countries) and optional review-page payloads.

Requires:
  pip install -r requirements.txt

Data sources:
  - CFD broker list: GET /api/v1/en/brokers/filter/cfd
  - Country labels/slugs: __NEXT_DATA__.props.pageProps.countryData on /brokers/filter
  - Per-country acceptance derived from restricted_countries on each broker record
  - Optional rich review blob: brokerReview query in each /brokers/{slug} page __NEXT_DATA__

Usage:
  python scrape_fxempire_brokers.py
  python scrape_fxempire_brokers.py --skip-review-pages
  python scrape_fxempire_brokers.py --delay 0.75 --output ../../brokers/fxempire.com.json

Writes brokers/fxempire.com.json at the repo root by default.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

HOST = "https://www.fxempire.com"
FILTER_PAGE = f"{HOST}/brokers/filter"
CFD_API = f"{HOST}/api/v1/en/brokers/filter/cfd"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def parse_next_data(html: str) -> dict | None:
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>([^<]+)</script>', html)
    if not m:
        return None
    return json.loads(m.group(1))


def restricted_country_slugs(broker: dict) -> set[str]:
    out: set[str] = set()
    for rc in broker.get("restricted_countries") or []:
        if not isinstance(rc, dict):
            continue
        c = rc.get("country")
        if isinstance(c, dict) and c.get("slug"):
            out.add(c["slug"])
    return out


def extract_broker_review(html: str) -> dict | None:
    d = parse_next_data(html)
    if not d:
        return None
    queries = (
        d.get("props", {})
        .get("pageProps", {})
        .get("dehydratedState", {})
        .get("queries", [])
    )
    for q in queries:
        if q.get("queryKey") == "brokerReview":
            data = (q.get("state") or {}).get("data")
            if isinstance(data, dict):
                return data
    return None


def fetch_filter_countries(session: requests.Session) -> list[dict]:
    r = session.get(FILTER_PAGE, timeout=120)
    r.raise_for_status()
    nd = parse_next_data(r.text)
    if not nd:
        raise RuntimeError("Could not parse __NEXT_DATA__ from filter page")
    rows = (
        nd.get("props", {}).get("pageProps", {}).get("countryData") or []
    )
    if not rows:
        raise RuntimeError("countryData missing from filter page")
    return rows


def fetch_broker_list(session: requests.Session) -> list[dict]:
    r = session.get(CFD_API, timeout=120)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list):
        raise TypeError("CFD API returned non-list")
    return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--output",
        type=Path,
        default=repo_root() / "brokers" / "fxempire.com.json",
        help="Output JSON path",
    )
    ap.add_argument(
        "--delay",
        type=float,
        default=0.55,
        help="Seconds between review-page HTTP requests",
    )
    ap.add_argument(
        "--skip-review-pages",
        action="store_true",
        help="Only use CFD filter API + country mapping (no per-broker review HTML)",
    )
    args = ap.parse_args()

    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})

    countries_raw = fetch_filter_countries(session)
    countries = [c for c in countries_raw if c.get("slug") and c["slug"] != "allcountries"]

    brokers_api = fetch_broker_list(session)
    by_slug = {b["slug"]: b for b in brokers_api if b.get("slug")}

    retrieved_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    broker_entries: list[dict] = []
    for slug, rec in sorted(by_slug.items()):
        restricted = restricted_country_slugs(rec)
        accepting = sorted(
            c["slug"] for c in countries if c["slug"] not in restricted
        )
        review_data = None
        if not args.skip_review_pages:
            url = f"{HOST}/brokers/{slug}"
            try:
                rr = session.get(url, timeout=120)
                rr.raise_for_status()
                review_data = extract_broker_review(rr.text)
            except Exception as exc:
                review_data = {"_fetchError": str(exc)}
            time.sleep(max(0.0, args.delay))

        broker_entries.append(
            {
                "slug": slug,
                "name": rec.get("name"),
                "id": rec.get("id"),
                "urls": {"fxempireReview": f"{HOST}/brokers/{slug}"},
                "listingScores": {
                    "overall_score": rec.get("overall_score"),
                    "trust_score": rec.get("trust_score"),
                    "fees_score": rec.get("fees_score"),
                    "platforms_score": rec.get("platforms_score"),
                    "deposit_score": rec.get("deposit_score"),
                    "tradable_instruments_score": rec.get("tradable_instruments_score"),
                    "research_score": rec.get("research_score"),
                    "education_score": rec.get("education_score"),
                    "customer_support_score": rec.get("customer_support_score"),
                },
                "restrictedCountrySlugs": sorted(restricted),
                "countriesAccepting": accepting,
                "cfdFilterApiRecord": rec,
                "reviewPageBrokerReview": review_data,
            }
        )

    by_country: list[dict] = []
    for c in countries:
        cslug = c["slug"]
        slugs = sorted(
            s for s in by_slug if cslug not in restricted_country_slugs(by_slug[s])
        )
        by_country.append(
            {
                "slug": cslug,
                "name": c.get("name"),
                "isoCode": c.get("code"),
                "isoCode3": c.get("code_3_letter"),
                "_id": c.get("_id"),
                "brokerSlugsAccepting": slugs,
                "brokerCount": len(slugs),
            }
        )

    out = {
        "meta": {
            "sourceBaseUrl": FILTER_PAGE,
            "brokerListingApiUrl": CFD_API,
            "retrievedAt": retrieved_at,
            "listingFetchMethod": "api",
            "countryCount": len(countries),
            "brokerRecordCount": len(brokers_api),
            "uniqueBrokerCount": len(by_slug),
            "reviewPagesFetched": not args.skip_review_pages,
            "notes": (
                "Country acceptance is derived from each broker's restricted_countries list "
                "on the CFD filter API: a broker 'accepts' a country if that country's slug "
                "does not appear in restricted_countries. Review payload is the brokerReview "
                "query from each broker page __NEXT_DATA__ dehydratedState when "
                "--skip-review-pages is not used."
            ),
        },
        "countries": by_country,
        "brokers": broker_entries,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Wrote {args.output} ({len(broker_entries)} brokers, {len(by_country)} countries)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
