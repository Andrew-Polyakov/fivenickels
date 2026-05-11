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
from datetime import datetime
from pathlib import Path
from typing import Any

_TOOLS_DIR = Path(__file__).resolve().parent
if str(_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOLS_DIR))

import article_submit_lib as lib

LOGGER = logging.getLogger("article_pipeline")


def _artifact_dir(symbols: list[str]) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    label = "-".join(symbol.lower() for symbol in symbols[:5]) or "news"
    path = lib.repo_root() / "reports" / "pipeline-artifacts" / f"{stamp}-{label}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _artifact_paths(
    *,
    symbols: list[str],
    keep_json: str | None,
    enrich_ollama: bool,
) -> tuple[Path, Path | None]:
    if keep_json:
        crawl_path = Path(keep_json)
        crawl_path.parent.mkdir(parents=True, exist_ok=True)
        enrich_path = crawl_path.with_name(f"{crawl_path.stem}.enriched.json")
        return crawl_path, enrich_path if enrich_ollama else None

    artifact_dir = _artifact_dir(symbols)
    crawl_path = artifact_dir / "crawl.json"
    enrich_path = artifact_dir / "enriched.json" if enrich_ollama else None
    return crawl_path, enrich_path


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


def _enrich_command(
    *,
    input_path: Path,
    output_path: Path,
    ollama_base_url: str | None,
    ollama_model: str | None,
    ollama_timeout: float,
    ollama_retries: int,
    ollama_retry_delay: float,
    section_slug: str | None,
    prompts_file: str | None,
) -> list[str]:
    command = [
        sys.executable,
        str(_TOOLS_DIR / "enrich-articles-ollama.py"),
        "--input-file",
        str(input_path),
        "--output-file",
        str(output_path),
        "--timeout",
        str(ollama_timeout),
        "--retries",
        str(ollama_retries),
        "--retry-delay",
        str(ollama_retry_delay),
    ]
    if ollama_base_url:
        command.extend(["--ollama-base-url", ollama_base_url])
    if ollama_model:
        command.extend(["--ollama-model", ollama_model])
    if section_slug:
        command.extend(["--section-slug", section_slug])
    if prompts_file:
        command.extend(["--prompts-file", prompts_file])
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


def _run_enrich(
    *,
    input_path: Path,
    output_path: Path,
    ollama_base_url: str | None,
    ollama_model: str | None,
    ollama_timeout: float,
    ollama_retries: int,
    ollama_retry_delay: float,
    section_slug: str | None,
    prompts_file: str | None,
) -> int:
    command = _enrich_command(
        input_path=input_path,
        output_path=output_path,
        ollama_base_url=ollama_base_url,
        ollama_model=ollama_model,
        ollama_timeout=ollama_timeout,
        ollama_retries=ollama_retries,
        ollama_retry_delay=ollama_retry_delay,
        section_slug=section_slug,
        prompts_file=prompts_file,
    )
    LOGGER.info("enrich start model=%s", ollama_model or "(default)")
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
                LOGGER.info("enrich stderr: %s", line)
    if completed.returncode != 0:
        LOGGER.error("enrich failed exit=%s", completed.returncode)
        return completed.returncode
    LOGGER.info("enrich complete output=%s", output_path)
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
    lib.bootstrap_submit_env()

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
    parser.add_argument(
        "--enrich-ollama",
        action="store_true",
        help="Run enrich-articles-ollama.py between crawl and submit.",
    )
    parser.add_argument(
        "--ollama-base-url",
        default=None,
        help="Optional Ollama base URL for --enrich-ollama.",
    )
    parser.add_argument(
        "--ollama-model",
        default=None,
        help="Optional Ollama model for --enrich-ollama.",
    )
    parser.add_argument(
        "--ollama-timeout",
        type=float,
        default=120.0,
        help="Per-request timeout in seconds for --enrich-ollama.",
    )
    parser.add_argument(
        "--ollama-retries",
        type=int,
        default=1,
        help="Per-article retries for --enrich-ollama.",
    )
    parser.add_argument(
        "--ollama-retry-delay",
        type=float,
        default=1.0,
        help="Delay in seconds between retry attempts for --enrich-ollama.",
    )
    parser.add_argument(
        "--ollama-prompts-file",
        default=None,
        help=(
            "JSON prompt config for --enrich-ollama "
            "(default: OLLAMA_ENRICHMENT_PROMPTS_FILE env or repo config file)."
        ),
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

    ollama_prompts_file = (args.ollama_prompts_file or "").strip() or None
    if not ollama_prompts_file:
        ollama_prompts_file = (os.environ.get("OLLAMA_ENRICHMENT_PROMPTS_FILE") or "").strip() or None

    keep_json = (args.keep_json or "").strip() or None
    json_path, enrich_path = _artifact_paths(
        symbols=symbols,
        keep_json=keep_json,
        enrich_ollama=args.enrich_ollama,
    )
    submit_input_path = enrich_path or json_path
    artifacts = {
        "crawl_json": str(json_path),
        "enriched_json": str(enrich_path) if enrich_path is not None else None,
    }

    crawl_exit = 0
    enrich_exit = 0
    submit_exit = 0
    submit_summary: dict[str, Any] | None = None

    crawl_exit = _run_crawl(symbols, output_path=json_path)
    if crawl_exit != 0:
        result = {
            "symbols": symbols,
            "artifacts": artifacts,
            "crawl_exit": crawl_exit,
            "enrich_exit": None,
            "submit_summary": None,
            "dry_run": args.dry_run,
        }
        print(json.dumps(result, indent=2))
        return crawl_exit

    if args.enrich_ollama:
        assert enrich_path is not None
        enrich_exit = _run_enrich(
            input_path=json_path,
            output_path=enrich_path,
            ollama_base_url=(args.ollama_base_url or "").strip() or None,
            ollama_model=(args.ollama_model or "").strip() or None,
            ollama_timeout=max(1.0, args.ollama_timeout),
            ollama_retries=max(0, args.ollama_retries),
            ollama_retry_delay=max(0.0, args.ollama_retry_delay),
            section_slug=config.section_slug,
            prompts_file=ollama_prompts_file,
        )
        if enrich_exit != 0:
            result = {
                "symbols": symbols,
                "artifacts": artifacts,
                "crawl_exit": crawl_exit,
                "enrich_exit": enrich_exit,
                "submit_summary": None,
                "dry_run": args.dry_run,
            }
            print(json.dumps(result, indent=2))
            return enrich_exit

    submit_exit, submit_summary = _run_submit(
        json_path=submit_input_path,
        config=config,
        dry_run=args.dry_run,
    )
    if submit_exit != 0:
        result = {
            "symbols": symbols,
            "artifacts": artifacts,
            "crawl_exit": crawl_exit,
            "enrich_exit": enrich_exit if args.enrich_ollama else None,
            "submit_summary": submit_summary,
            "dry_run": args.dry_run,
        }
        print(json.dumps(result, indent=2))
        return submit_exit

    result = {
        "symbols": symbols,
        "artifacts": artifacts,
        "crawl_exit": crawl_exit,
        "enrich_exit": enrich_exit if args.enrich_ollama else None,
        "submit_summary": submit_summary,
        "dry_run": args.dry_run,
    }
    print(json.dumps(result, indent=2))
    return _submit_exit_code(submit_summary)


if __name__ == "__main__":
    raise SystemExit(main())
