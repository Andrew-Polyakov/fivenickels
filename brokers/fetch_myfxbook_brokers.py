"""
Build brokers/myfxbook.com.json from Myfxbook's Forex Brokers directory.

Primary sources:
  - Compare / filters page: https://www.myfxbook.com/forex-brokers
  - Broker slug discovery: https://www.myfxbook.com/reviews/brokers/9,{page}
  - Full broker profile (same fields as on-site filters): each broker's review page
    https://www.myfxbook.com/reviews/brokers/{slug}/{id},1
    (The older forex-brokers/{slug} overview URLs often 404; review pages are authoritative.)

Fetches try direct HTTPS first, then r.jina.ai mirrors. Optional JINA_API_KEY helps if
the mirror returns 403.

Requires Python 3.10+ (stdlib only).

Usage:
  python fetch_myfxbook_brokers.py
  python fetch_myfxbook_brokers.py --from-json brokers.json --skip-compare
  python fetch_myfxbook_brokers.py --from-json brokers.json --only-slugs pepperstone,fxpro
  python fetch_myfxbook_brokers.py --max-pages 5 --skip-details
  python fetch_myfxbook_brokers.py --out myfxbook.com.json
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
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SOURCE_COMPARE = "https://www.myfxbook.com/forex-brokers"
SOURCE_LISTING = "https://www.myfxbook.com/reviews/brokers/9,{page}"
SOURCE_REVIEW = "https://www.myfxbook.com/reviews/brokers/{slug}/{id},1"
SOURCE_DETAIL_LEGACY = "https://www.myfxbook.com/forex-brokers/{slug}"
JINA_HTTP = "https://r.jina.ai/http://"
JINA_HTTPS = "https://r.jina.ai/https://"

DEFAULT_OUT = Path(__file__).resolve().parent / "myfxbook.com.json"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def http_get(url: str, timeout: float = 75.0, extra_headers: dict[str, str] | None = None) -> str:
    last_err: Exception | None = None
    for attempt in range(5):
        headers = {"User-Agent": UA, "Accept": "text/plain,text/html,*/*,application/json"}
        if extra_headers:
            headers.update(extra_headers)
        token = os.environ.get("JINA_API_KEY", "").strip()
        if token and "jina.ai" in url:
            headers.setdefault("Authorization", f"Bearer {token}")
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (429, 503) and attempt < 4:
                time.sleep(25 * (attempt + 1))
                continue
            raise
    assert last_err
    raise last_err


def fetch_via_jina(http_url: str, prefer_https: bool) -> str:
    path = http_url.replace("https://", "").replace("http://", "")
    prefix = JINA_HTTPS if prefer_https else JINA_HTTP
    return http_get(prefix + path, extra_headers={})


def fetch_text(http_url: str) -> str:
    """Direct fetch, then jina http, then jina https."""
    errs: list[str] = []
    try:
        return http_get(http_url)
    except Exception as e:
        errs.append(f"direct:{e!r}")
    try:
        return fetch_via_jina(http_url, prefer_https=False)
    except Exception as e:
        errs.append(f"jina_http:{e!r}")
    try:
        return fetch_via_jina(http_url, prefer_https=True)
    except Exception as e:
        errs.append(f"jina_https:{e!r}")
    raise RuntimeError("All fetch strategies failed: " + "; ".join(errs))


def extract_slugs_and_ids(markdown: str) -> dict[str, str | None]:
    """slug -> myfxbook numeric id (first seen)."""
    out: dict[str, str | None] = {}
    for m in re.finditer(
        r"https?://(?:www\.)?myfxbook\.com/reviews/brokers/([^/]+)/(\d+)",
        markdown,
        re.I,
    ):
        slug, bid = m.group(1).lower(), m.group(2)
        if slug not in out:
            out[slug] = bid
    for m in re.finditer(
        r"https?://(?:www\.)?myfxbook\.com/forex-brokers/([a-z0-9-]+)/?(?:\s|\)|\"|'])",
        markdown,
        re.I,
    ):
        slug = m.group(1).lower()
        if slug in ("criteria", "forex-brokers"):
            continue
        if slug not in out:
            out[slug] = None
    return out


def read_field(markdown: str, label: str) -> str | None:
    """Label/value pairs from jina-style markdown."""
    lines = markdown.splitlines()
    want = label.strip().rstrip(":").lower()
    for i, line in enumerate(lines):
        stripped = line.strip()
        low = stripped.lower()
        if low.startswith(want + ":"):
            rest = stripped.split(":", 1)[1].strip()
            if rest:
                return rest
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines):
                return lines[j].strip() or None
            return None
        key = stripped.rstrip(":").strip()
        if key.lower() == want:
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j >= len(lines):
                return None
            return lines[j].strip() or None
    return None


def read_field_any(markdown: str, labels: tuple[str, ...]) -> str | None:
    for lb in labels:
        v = read_field(markdown, lb)
        if v:
            return v
    return None


def extract_features_between(text: str, start: str, end: str) -> list[str]:
    lines = text.splitlines()
    try:
        i = next(idx for idx, l in enumerate(lines) if l.strip() == start)
    except StopIteration:
        return []
    try:
        j = next(idx for idx in range(i + 1, len(lines)) if lines[idx].strip() == end)
    except StopIteration:
        return []
    out: list[str] = []
    for k in range(i + 1, j):
        s = lines[k].strip()
        if s and not s.startswith("!["):
            out.append(s)
    return out


def regulation_fallback(markdown: str) -> str | None:
    """When 'Regulation' label is missing, join bullets after 'regulated by:'."""
    m = re.search(r"regulated by:\s*\n+((?:- [^\n]+\n)+)", markdown, re.I)
    if not m:
        return None
    parts = [ln[2:].strip() for ln in m.group(1).splitlines() if ln.strip().startswith("- ")]
    return "; ".join(parts) if parts else None


def parse_review_page(markdown: str, slug_hint: str | None = None) -> dict[str, Any] | None:
    if re.search(r"Title:\s*Error\s+404|404\s+Not\s+Found|# Error 404", markdown, re.I):
        return None
    if "Markdown Content:" in markdown:
        body = markdown.split("Markdown Content:", 1)[1]
    else:
        body = markdown

    name = read_field_any(markdown, ("Company Full Name",))
    if not name:
        for m in re.finditer(r"^#\s+(.+)$", body, re.M):
            candidate = m.group(1).strip()
            candidate = re.sub(r"\s+Review And Rating.*$", "", candidate, flags=re.I).strip()
            if len(candidate) > 120 or "\n" in candidate:
                continue
            if not candidate:
                continue
            name = candidate
            break
    if not name:
        for line in body.splitlines():
            s = line.strip()
            if not s or s.startswith("![") or s.startswith("[![") or s.startswith("http"):
                continue
            if s in ("Minimum deposit ($)", "Title", "Broker Details"):
                continue
            if "|" in s and "Myfxbook" in s:
                name = s.split("|")[0].strip()
                break
            if s.startswith("#"):
                name = s.lstrip("#").strip()
                name = re.sub(r"\s+Review And Rating.*$", "", name, flags=re.I).strip()
                break
            name = s
            break
    if not name or re.search(r"not found|error 404", name, re.I):
        return None
    if "|" in name:
        name = name.split("|")[0].strip()

    if name and len(name) > 90 and slug_hint:
        name = slug_hint.replace("-", " ").title()

    fields: dict[str, Any] = {
        "displayName": name,
        "minimumDepositUsd": read_field(markdown, "Minimum deposit ($)"),
        "commission": read_field(markdown, "Commission"),
        "acceptingUsClients": read_field(markdown, "Accepting US clients?"),
        "decimals": read_field(markdown, "Decimals"),
        "minimumLotSize": read_field_any(markdown, ("Minimum lot size",)),
        "maximumLotSize": read_field_any(markdown, ("Maximum lot size",)),
        "spread": read_field(markdown, "Spread"),
        "brokerType": read_field(markdown, "Broker type"),
        "maxLeverage": read_field_any(
            markdown,
            ("Maximal leverage (1:?)", "Max. Leverage", "Maximal leverage"),
        ),
        "phone": read_field(markdown, "Phone"),
        "fax": read_field(markdown, "Fax"),
        "availability": read_field(markdown, "Availability"),
        "email": read_field(markdown, "Email"),
        "address": read_field(markdown, "Address"),
        "regulation": read_field(markdown, "Regulation"),
        "tradingPlatforms": read_field(markdown, "Trading Platforms"),
        "fundingWithdrawalMethods": read_field_any(
            markdown,
            ("Funding/Withdrawal methods",),
        ),
        "accountCurrency": read_field(markdown, "Account Currency"),
        "languages": read_field(markdown, "Languages"),
        "establishedCountry": read_field(markdown, "Established Country"),
        "country": read_field(markdown, "Country"),
        "internationalOffices": read_field(markdown, "International offices"),
        "tradingPlatformTimezone": read_field(markdown, "Trading platform(s) timezone"),
        "otherTradingInstruments": read_field(markdown, "Other trading instruments"),
        "website": read_field(markdown, "Website"),
        "brokerStatus": read_field(markdown, "Broker status"),
    }

    if not fields.get("regulation"):
        fb = regulation_fallback(markdown)
        if fb:
            fields["regulation"] = fb

    fields["platformFeatures"] = extract_features_between(
        markdown, "Accepting US clients?", "Decimals"
    )

    return {"name": name, "fields": fields}


def parse_filter_catalog(compare_md: str) -> dict[str, Any]:
    """Country/criteria links and raw filter copy from the compare page."""
    seen_u: set[str] = set()
    countries: list[dict[str, str]] = []

    for m in re.finditer(
        r"\[([^\]]+)\]\(https://www\.myfxbook\.com/forex-brokers/([a-z0-9-]+)/(\d+)\)",
        compare_md,
        re.I,
    ):
        url = f"https://www.myfxbook.com/forex-brokers/{m.group(2)}/{m.group(3)}"
        if url not in seen_u:
            seen_u.add(url)
            countries.append(
                {
                    "name": m.group(1).strip(),
                    "pathSlug": m.group(2),
                    "numericId": m.group(3),
                    "url": url,
                }
            )

    for m in re.finditer(
        r"myfxbook\.com/forex-brokers/([a-z0-9-]+)/(\d+)",
        compare_md,
        re.I,
    ):
        slug, nid = m.group(1), m.group(2)
        if slug == "criteria":
            continue
        url = f"https://www.myfxbook.com/forex-brokers/{slug}/{nid}"
        if url not in seen_u:
            seen_u.add(url)
            countries.append(
                {
                    "name": slug.replace("-", " ").title(),
                    "pathSlug": slug,
                    "numericId": nid,
                    "url": url,
                }
            )

    seen_c: set[str] = set()
    criteria: list[dict[str, str]] = []
    for m in re.finditer(
        r"\[([^\]]+)\]\(https://www\.myfxbook\.com/forex-brokers/criteria/([a-z0-9-]+)/?\)",
        compare_md,
        re.I,
    ):
        slug = m.group(2)
        if slug not in seen_c:
            seen_c.add(slug)
            criteria.append(
                {
                    "name": m.group(1).strip(),
                    "slug": slug,
                    "url": f"https://www.myfxbook.com/forex-brokers/criteria/{slug}/",
                }
            )
    for m in re.finditer(
        r"myfxbook\.com/forex-brokers/criteria/([a-z0-9-]+)/?",
        compare_md,
        re.I,
    ):
        slug = m.group(1)
        if slug not in seen_c:
            seen_c.add(slug)
            criteria.append(
                {
                    "name": slug.replace("-", " ").title(),
                    "slug": slug,
                    "url": f"https://www.myfxbook.com/forex-brokers/criteria/{slug}/",
                }
            )

    section_order = (
        "Broker type",
        "Countries",
        "International offices",
        "Regulation",
        "Broker status",
        "Account Currency",
        "Funding/Withdrawal methods",
        "Languages",
        "Availability",
        "Trading",
        "Trading Platforms",
        "Trading platform(s) timezone",
        "Other trading instruments",
    )
    raw_sections: dict[str, str] = {}
    for i, head in enumerate(section_order):
        end = section_order[i + 1] if i + 1 < len(section_order) else "Minimal deposit ($)"
        chunk = _slice_between_labels(compare_md, head, end)
        if chunk:
            raw_sections[head] = chunk[:20000]

    return {
        "_note": (
            "On Myfxbook the forex-brokers compare filters (full country list, long regulation "
            "lists, etc.) are largely populated by JavaScript. Plain-HTTP mirrors often leave "
            "'Loading…' and omit filter markup; countryDirectoryLinks are static footer/nav links "
            "(featured countries). Full geography and regulation per broker appear under each "
            "broker's profile fields."
        ),
        "countryDirectoryLinks": countries,
        "criteriaDirectoryLinks": criteria,
        "rawFilterSections": raw_sections,
    }


def _slice_between_labels(text: str, start_heading: str, end_heading: str) -> str | None:
    """Text strictly between two standalone filter headings on the compare page."""
    m = re.search(
        r"(?:^|\n)" + re.escape(start_heading) + r"\s*\n+(.+?)(?=\n" + re.escape(end_heading) + r"(?:\n|$))",
        text,
        re.S | re.M,
    )
    if m:
        s = m.group(1).strip()
        if s:
            return s
    lines = text.splitlines()
    try:
        si = next(i for i, l in enumerate(lines) if l.strip() == start_heading)
    except StopIteration:
        return None
    try:
        ei = next(i for i in range(si + 1, len(lines)) if lines[i].strip() == end_heading)
    except StopIteration:
        body = "\n".join(lines[si + 1 :]).strip()
        return body or None
    return "\n".join(lines[si + 1 : ei]).strip() or None


def discover_slugs(max_pages: int) -> dict[str, str | None]:
    merged: dict[str, str | None] = {}
    empty_streak = 0
    no_new_streak = 0
    for page in range(1, max_pages + 1):
        url = SOURCE_LISTING.format(page=page)
        print(f"  listing page {page}/{max_pages} …", flush=True)
        body: str | None = None
        for attempt in range(4):
            try:
                body = fetch_text(url)
                break
            except Exception as e:
                print(f"    fetch error (try {attempt + 1}/4): {e!r}", flush=True)
                time.sleep(20 * (attempt + 1))
        if body is None:
            print("    giving up on this page; continuing.", flush=True)
            continue
        before = len(merged)
        found = extract_slugs_and_ids(body)
        merged.update(found)
        added = len(merged) - before
        print(
            f"    +{len(found)} broker refs, +{added} new slugs (total {len(merged)})",
            flush=True,
        )
        if not found:
            empty_streak += 1
            if empty_streak >= 3:
                break
        else:
            empty_streak = 0
        if found and added == 0:
            no_new_streak += 1
            if no_new_streak >= 10:
                print("  Stopping: no new brokers for 10 consecutive non-empty pages.", flush=True)
                break
        else:
            no_new_streak = 0
        time.sleep(0.35)
    return merged


def fetch_review(slug: str, bid: str) -> tuple[str, dict[str, Any] | None, str | None]:
    url = SOURCE_REVIEW.format(slug=slug, id=bid)
    try:
        body = fetch_text(url)
        parsed = parse_review_page(body, slug_hint=slug)
        if parsed is None:
            return slug, None, "review_parse_failed"
        return slug, parsed, None
    except Exception as e:
        return slug, None, str(e)


def _is_placeholder(val: str | None) -> bool:
    if val is None:
        return True
    s = str(val).strip()
    return s in ("", "-", "—", "n/a", "N/A", "* * *")


def _normalize_leverage_display(raw: str | None) -> str | None:
    if _is_placeholder(raw):
        return None
    s = str(raw).strip()
    if not s:
        return None
    if re.match(r"^1:\s*\d", s, re.I):
        return s.replace(" ", "")
    m = re.match(r"^(\d+)$", s)
    if m:
        return f"1:{m.group(1)}"
    return s


def _normalize_commission_display(raw: str | None) -> str | None:
    if _is_placeholder(raw):
        return None
    s = str(raw).strip()
    if not s:
        return None
    if s.startswith("$"):
        return s
    if re.match(r"^\d+(\.\d+)?$", s):
        return f"${s}"
    return s


def comparison_columns_from_profile(fields: dict[str, Any] | None) -> dict[str, Any]:
    """Five columns matching the on-site forex-brokers comparison table."""
    if not fields:
        return {
            "Regulation": None,
            "Broker type": None,
            "Max. Leverage": None,
            "Min. Deposit": None,
            "Commission": None,
        }
    dep = fields.get("minimumDepositUsd")
    if _is_placeholder(dep):
        dep_out = None
    elif dep is not None and str(dep).strip() != "":
        ds = str(dep).strip()
        if re.match(r"^\d+(\.\d+)?$", ds):
            try:
                fv = float(ds)
                if fv == 0:
                    dep_out = "$0"
                else:
                    dep_out = f"${ds}"
            except ValueError:
                dep_out = f"${ds}" if re.match(r"^\d+(\.\d+)?$", ds) else ds
        else:
            dep_out = ds
    else:
        dep_out = None
    reg = fields.get("regulation")
    btype = fields.get("brokerType")
    return {
        "Regulation": None if _is_placeholder(reg) else reg,
        "Broker type": None if _is_placeholder(btype) else btype,
        "Max. Leverage": _normalize_leverage_display(fields.get("maxLeverage")),
        "Min. Deposit": dep_out,
        "Commission": _normalize_commission_display(fields.get("commission")),
    }


def load_slug_map_from_brokers_json(path: Path) -> dict[str, str | None]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    rows = raw.get("brokers", [])
    out: dict[str, str | None] = {}
    for b in rows:
        slug = (b.get("slug") or "").strip().lower()
        if not slug:
            continue
        bid = b.get("myfxbook_review_id") or b.get("myfxbookReviewId")
        out[slug] = str(bid) if bid is not None else None
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output JSON path")
    ap.add_argument(
        "--from-json",
        type=Path,
        default=None,
        help="Load slug → review id map from brokers.json (skip paginated listing discovery)",
    )
    ap.add_argument("--max-pages", type=int, default=120)
    ap.add_argument("--skip-details", action="store_true")
    ap.add_argument("--skip-compare", action="store_true", help="Skip filter/catalog fetch")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument(
        "--limit-details",
        type=int,
        default=0,
        metavar="N",
        help="Fetch at most N review profiles (0 = all). Useful for smoke tests.",
    )
    ap.add_argument(
        "--only-slugs",
        type=str,
        default="",
        help="Comma-separated slugs to include (default: all when empty).",
    )
    ap.add_argument(
        "--repair-fetch-errors",
        action="store_true",
        help="Load --out JSON and re-fetch only rows with fetchError (sequential, slow, rate-limit friendly).",
    )
    args = ap.parse_args()

    if args.repair_fetch_errors:
        if not args.out.is_file():
            print(f"Cannot repair: {args.out} not found.", file=sys.stderr)
            return 1
        payload = json.loads(args.out.read_text(encoding="utf-8"))
        rows: list[dict[str, Any]] = payload.get("brokers", [])
        to_fix = [b for b in rows if b.get("fetchError") and b.get("myfxbookReviewId")]
        print(f"Repairing {len(to_fix)} broker profile(s) with fetchError…", flush=True)
        for i, b in enumerate(to_fix, 1):
            slug = b["slug"]
            bid = str(b["myfxbookReviewId"])
            time.sleep(3.0)
            try:
                body = fetch_text(SOURCE_REVIEW.format(slug=slug, id=bid))
                parsed = parse_review_page(body, slug_hint=slug)
                if parsed and isinstance(parsed.get("fields"), dict):
                    b.pop("fetchError", None)
                    b["name"] = parsed.get("name")
                    b["profile"] = parsed["fields"]
                    b["comparison"] = comparison_columns_from_profile(parsed["fields"])
                else:
                    b["fetchError"] = "repair_parse_failed"
            except Exception as e:
                b["fetchError"] = str(e)
            if i % 25 == 0:
                payload["stats"]["profilesFetched"] = sum(
                    1 for x in rows if isinstance(x.get("profile"), dict)
                )
                payload["scrapedAt"] = (
                    datetime.now(timezone.utc).replace(microsecond=0).isoformat()
                )
                args.out.write_text(
                    json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
                print(f"  checkpoint {i}/{len(to_fix)}", flush=True)
        if not payload.get("filters"):
            try:
                payload["filters"] = parse_filter_catalog(fetch_text(SOURCE_COMPARE))
            except Exception as e:
                payload["filters"] = {"error": str(e)}
        payload["stats"]["profilesFetched"] = sum(
            1 for x in rows if isinstance(x.get("profile"), dict)
        )
        payload["scrapedAt"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        args.out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Repair complete. Wrote {args.out}.", flush=True)
        return 0

    filters: dict[str, Any] | None = None
    if not args.skip_compare:
        print("Fetching compare page for filters / country & criteria links...", flush=True)
        try:
            cmp_body = fetch_text(SOURCE_COMPARE)
            filters = parse_filter_catalog(cmp_body)
            print(
                f"  countries: {len(filters['countryDirectoryLinks'])}, "
                f"criteria: {len(filters['criteriaDirectoryLinks'])}",
                flush=True,
            )
        except Exception as e:
            print(f"  compare page failed: {e}", flush=True)
            filters = {"error": str(e)}

    if args.from_json:
        print(f"Loading broker slugs from {args.from_json}...", flush=True)
        slug_map = load_slug_map_from_brokers_json(args.from_json)
        slugs = sorted(slug_map.keys())
        print(f"Loaded {len(slugs)} slugs from file.", flush=True)
    else:
        print("Discovering broker slugs from paginated reviews listing...", flush=True)
        slug_map = discover_slugs(args.max_pages)
        slugs = sorted(slug_map.keys())
        print(f"Found {len(slugs)} unique slugs.", flush=True)

    if args.only_slugs.strip():
        allow = {s.strip().lower() for s in args.only_slugs.split(",") if s.strip()}
        slugs = [s for s in slugs if s in allow]
        slug_map = {s: slug_map[s] for s in slugs if s in slug_map}
        print(f"Filtered to {len(slugs)} slug(s) (--only-slugs).", flush=True)

    details: dict[str, dict[str, Any]] = {}
    if not args.skip_details and slugs:
        need: list[tuple[str, str]] = []
        for s in slugs:
            bid = slug_map.get(s)
            if bid:
                need.append((s, bid))
        if args.limit_details > 0:
            need = need[: args.limit_details]
            print(f"Limiting to first {len(need)} brokers (--limit-details).", flush=True)
        print(f"Fetching full review pages ({args.workers} workers)...", flush=True)
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futs = {ex.submit(fetch_review, s, b): s for s, b in need}
            done = 0
            for fut in as_completed(futs):
                slug, data, err = fut.result()
                done += 1
                if done % 75 == 0 or done == len(need):
                    print(f"  reviews {done}/{len(need)}", flush=True)
                if data:
                    details[slug] = data
                else:
                    details[slug] = {"_error": err or "unknown"}

    brokers: list[dict[str, Any]] = []
    for slug in slugs:
        bid = slug_map.get(slug)
        review_url = f"https://www.myfxbook.com/reviews/brokers/{slug}/{bid},1" if bid else None
        rec: dict[str, Any] = {
            "slug": slug,
            "myfxbookReviewId": bid,
            "urls": {
                "review": review_url,
                "compareDetail": SOURCE_DETAIL_LEGACY.format(slug=slug),
            },
        }
        d = details.get(slug)
        if isinstance(d, dict) and "_error" not in d:
            rec["name"] = d.get("name")
            fld = d.get("fields")
            rec["profile"] = fld
            rec["comparison"] = comparison_columns_from_profile(fld if isinstance(fld, dict) else None)
        elif isinstance(d, dict) and "_error" in d:
            rec["name"] = slug.replace("-", " ").title()
            rec["fetchError"] = d["_error"]
            rec["comparison"] = comparison_columns_from_profile(None)
        else:
            rec["name"] = slug.replace("-", " ").title()
            rec["comparison"] = comparison_columns_from_profile(None)
        brokers.append(rec)

    payload = {
        "source": SOURCE_COMPARE,
        "scrapedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "stats": {
            "listingPagesScanned": args.max_pages,
            "uniqueSlugs": len(slugs),
            "withNumericId": sum(1 for s in slugs if slug_map.get(s)),
            "profilesFetched": sum(
                1 for b in brokers if isinstance(b.get("profile"), dict)
            ),
            "fetchErrors": sum(1 for b in brokers if b.get("fetchError")),
        },
        "filters": filters,
        "listingSourcePattern": SOURCE_LISTING,
        "reviewSourcePattern": SOURCE_REVIEW,
        "brokers": brokers,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {args.out} ({len(brokers)} brokers).", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
