#!/usr/bin/env python3
"""
Production entry point: crawl StockCrawler news for CLI tickers and submit to Wigtail.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

_TOOLS_DIR = Path(__file__).resolve().parent
if str(_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOLS_DIR))

import article_submit_lib as lib

LOGGER = logging.getLogger("article_pipeline")


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        stream=sys.stderr,
    )


def _crawler_command(symbols: list[str]) -> list[str]:
    if os.name == "nt":
        project = _TOOLS_DIR / "StockCrawler" / "StockCrawler.csproj"
        return ["dotnet", "run", "--project", str(project), "--", "news", *symbols]
    crawler = _TOOLS_DIR / "stock-crawler"
    return [str(crawler), "news", *symbols]


def _submit_command(
    *,
    json_path: Path,
    config: lib.SubmitConfig,
    dry_run: bool,
) -> list[str]:
    command = [
        sys.executable,
        str(_TOOLS_DIR / "submit-article"),
        "--input-file",
        str(json_path),
        "--endpoint",
        config.endpoint,
        "--timeout",
        str(config.timeout),
    ]
    if config.token:
        command.extend(["--token", config.token])
    if config.section_slug:
        command.extend(["--section-slug", config.section_slug])
    if dry_run:
        command.append("--dry-run")
    return command


def _run_crawl(symbols: list[str], *, output_path: Path) -> int:
    command = _crawler_command(symbols)
    LOGGER.info("crawl start symbols=%s", ",".join(symbols))
    completed = subprocess.run(
        command,
        cwd=str(lib.repo_root()),
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.stderr:
        for line in completed.stderr.splitlines():
            if line.strip():
                LOGGER.info("crawl stderr: %s", line)
    if completed.returncode != 0:
        LOGGER.error("crawl failed exit=%s", completed.returncode)
        return completed.returncode
    output_path.write_text(completed.stdout, encoding="utf-8")
    LOGGER.info("crawl complete output=%s", output_path)
    return 0


def _run_submit(
    *,
    json_path: Path,
    config: lib.SubmitConfig,
    dry_run: bool,
) -> tuple[int, dict[str, Any] | None]:
    command = _submit_command(json_path=json_path, config=config, dry_run=dry_run)
    LOGGER.info("submit start dry_run=%s", dry_run)
    completed = subprocess.run(
        command,
        cwd=str(lib.repo_root()),
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.stderr:
        for line in completed.stderr.splitlines():
            if line.strip():
                LOGGER.info("submit stderr: %s", line)
    if completed.returncode != 0:
        LOGGER.error("submit failed exit=%s", completed.returncode)
        return completed.returncode, None
    if not completed.stdout.strip():
        return 0, None
    try:
        summary = json.loads(completed.stdout)
    except json.JSONDecodeError:
        LOGGER.error("submit returned invalid JSON")
        return 1, None
    if isinstance(summary, dict):
        LOGGER.info(
            "submit complete created=%s skipped=%s failed=%s",
            summary.get("created"),
            summary.get("skipped"),
            summary.get("failed"),
        )
    return 0, summary if isinstance(summary, dict) else None


def _submit_exit_code(summary: dict[str, Any] | None) -> int:
    if summary is None:
        return 0
    failed = int(summary.get("failed") or 0)
    created = int(summary.get("created") or 0)
    if failed and not created:
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    _configure_logging()

    parser = argparse.ArgumentParser(
        description="Crawl StockCrawler news for tickers and submit articles for moderation.",
    )
    parser.add_argument(
        "tickers",
        nargs="+",
        metavar="TICKER",
        help="One or more ticker symbols (comma-separated tokens allowed).",
    )
    parser.add_argument("--endpoint", default=None, help="Wigtail auto-submit endpoint URL.")
    parser.add_argument(
        "--token",
        default=None,
        help="Bearer token (default: ARTICLE_SUBMIT_BEARER_TOKEN env).",
    )
    parser.add_argument(
        "--section-slug",
        default=None,
        help="Taxonomy section slug for created articles.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=60.0,
        help="HTTP timeout in seconds for submit-article.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run crawl and map articles without calling the Wigtail API.",
    )
    parser.add_argument(
        "--keep-json",
        default=None,
        help="Keep StockCrawler JSON at this path instead of a temporary file.",
    )
    args = parser.parse_args(argv)

    lib.load_repo_env()
    ticker_tokens = list(args.tickers)
    if ticker_tokens and ticker_tokens[0].strip().lower() == "news":
        ticker_tokens = ticker_tokens[1:]
    symbols = lib.normalize_symbols(ticker_tokens)
    if not symbols:
        print("At least one ticker symbol is required.", file=sys.stderr)
        return 2

    config = lib.resolve_submit_config(
        {
            "endpoint": args.endpoint,
            "token": args.token,
            "section_slug": args.section_slug,
            "timeout": args.timeout,
        }
    )
    config_error = lib.ensure_submit_config(config, dry_run=args.dry_run)
    if config_error:
        print(config_error, file=sys.stderr)
        return 2

    lib.apply_submit_config_to_env(config)

    keep_json = (args.keep_json or "").strip()
    temp_path: Path | None = None
    if keep_json:
        json_path = Path(keep_json)
        json_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        handle = tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".json",
            delete=False,
        )
        temp_path = Path(handle.name)
        handle.close()
        json_path = temp_path

    crawl_exit = 0
    submit_exit = 0
    submit_summary: dict[str, Any] | None = None
    try:
        crawl_exit = _run_crawl(symbols, output_path=json_path)
        if crawl_exit != 0:
            result = {
                "symbols": symbols,
                "crawl_exit": crawl_exit,
                "submit_summary": None,
                "dry_run": args.dry_run,
            }
            print(json.dumps(result, indent=2))
            return crawl_exit

        submit_exit, submit_summary = _run_submit(
            json_path=json_path,
            config=config,
            dry_run=args.dry_run,
        )
        if submit_exit != 0:
            result = {
                "symbols": symbols,
                "crawl_exit": crawl_exit,
                "submit_summary": submit_summary,
                "dry_run": args.dry_run,
            }
            print(json.dumps(result, indent=2))
            return submit_exit

        result = {
            "symbols": symbols,
            "crawl_exit": crawl_exit,
            "submit_summary": submit_summary,
            "dry_run": args.dry_run,
        }
        print(json.dumps(result, indent=2))
        return _submit_exit_code(submit_summary)
    finally:
        if temp_path is not None and temp_path.exists():
            temp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
