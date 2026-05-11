#!/usr/bin/env python3
"""
Crawl StockCrawler news, rewrite/enrich via local Ollama, and submit to Wigtail.
"""

from __future__ import annotations

import sys
from pathlib import Path

_TOOLS_DIR = Path(__file__).resolve().parent
if str(_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOLS_DIR))

import article_submit_lib as lib
import pipeline


def main(argv: list[str] | None = None) -> int:
    lib.bootstrap_submit_env()
    args = list(argv) if argv is not None else sys.argv[1:]
    return pipeline.main(["--enrich-ollama", *args])


if __name__ == "__main__":
    raise SystemExit(main())
