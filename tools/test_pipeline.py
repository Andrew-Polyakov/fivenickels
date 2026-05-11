"""Tests for tools/pipeline.py and article_submit_lib.py."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

_TOOLS_DIR = Path(__file__).resolve().parent
if str(_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOLS_DIR))

import article_submit_lib as lib


def _load_pipeline_module():
    spec = importlib.util.spec_from_file_location("pipeline", _TOOLS_DIR / "pipeline.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ArticleSubmitLibTests(unittest.TestCase):
    def test_normalize_symbols_dedupes_and_splits(self):
        self.assertEqual(lib.normalize_symbols(["nvda", "NVDA", "tsm,spy"]), ["NVDA", "TSM", "SPY"])

    def test_ensure_submit_config_requires_token_when_not_dry_run(self):
        config = lib.SubmitConfig(
            endpoint="http://127.0.0.1:8000/api/articles/auto-submit/",
            token="",
            section_slug=None,
            timeout=60.0,
        )
        self.assertEqual(
            lib.ensure_submit_config(config, dry_run=False),
            "Missing bearer token. Set ARTICLE_SUBMIT_BEARER_TOKEN or pass --token.",
        )
        self.assertIsNone(lib.ensure_submit_config(config, dry_run=True))

    def test_apply_submit_config_to_env_sets_token(self):
        config = lib.SubmitConfig(
            endpoint="http://127.0.0.1:8000/api/articles/auto-submit/",
            token="secret-token",
            section_slug="information-technology",
            timeout=60.0,
        )
        with mock.patch.dict(os.environ, {}, clear=True):
            lib.apply_submit_config_to_env(config)
            self.assertEqual(os.environ["ARTICLE_SUBMIT_BEARER_TOKEN"], "secret-token")
            self.assertEqual(
                os.environ["WIGTAIL_ARTICLE_SUBMIT_URL"],
                "http://127.0.0.1:8000/api/articles/auto-submit/",
            )


class PipelineMainTests(unittest.TestCase):
    def setUp(self):
        self.pipeline = _load_pipeline_module()

    def test_missing_tickers_exit_2(self):
        self.assertEqual(self.pipeline.main(["news"]), 2)

    def test_dry_run_runs_crawl_and_submit(self):
        with mock.patch.object(self.pipeline, "_run_crawl", return_value=0) as mock_crawl, mock.patch.object(
            self.pipeline,
            "_run_submit",
            return_value=(0, {"created": 0, "skipped": 0, "failed": 0, "results": []}),
        ) as mock_submit, mock.patch.object(self.pipeline, "lib") as mock_lib:
            mock_lib.repo_root.return_value = _TOOLS_DIR.parent
            mock_lib.load_dotenv.return_value = None
            mock_lib.normalize_symbols.return_value = ["NVDA"]
            mock_lib.resolve_submit_config.return_value = lib.SubmitConfig(
                endpoint="http://127.0.0.1:8000/api/articles/auto-submit/",
                token="secret-token",
                section_slug=None,
                timeout=60.0,
            )
            mock_lib.ensure_submit_config.return_value = None
            mock_lib.apply_submit_config_to_env.return_value = None

            exit_code = self.pipeline.main(["--dry-run", "NVDA"])

        self.assertEqual(exit_code, 0)
        mock_crawl.assert_called_once()
        mock_submit.assert_called_once()

    def test_crawl_failure_skips_submit(self):
        with mock.patch.object(self.pipeline, "_run_crawl", return_value=3) as mock_crawl, mock.patch.object(
            self.pipeline,
            "_run_submit",
        ) as mock_submit, mock.patch.object(self.pipeline, "lib") as mock_lib:
            mock_lib.repo_root.return_value = _TOOLS_DIR.parent
            mock_lib.load_dotenv.return_value = None
            mock_lib.normalize_symbols.return_value = ["NVDA"]
            mock_lib.resolve_submit_config.return_value = lib.SubmitConfig(
                endpoint="http://127.0.0.1:8000/api/articles/auto-submit/",
                token="secret-token",
                section_slug=None,
                timeout=60.0,
            )
            mock_lib.ensure_submit_config.return_value = None
            mock_lib.apply_submit_config_to_env.return_value = None

            exit_code = self.pipeline.main(["NVDA"])

        self.assertEqual(exit_code, 3)
        mock_crawl.assert_called_once()
        mock_submit.assert_not_called()

    @unittest.skipUnless(os.name == "nt", "Windows only")
    def test_crawler_command_uses_dotnet_on_windows(self):
        tools_dir = Path(r"C:\Users\me\My Drive\tools")
        with mock.patch.object(self.pipeline, "_TOOLS_DIR", tools_dir):
            command = self.pipeline._crawler_command(["COST"])
        self.assertEqual(command[0], "dotnet")
        self.assertIn("My Drive", command[3])
        self.assertIn("StockCrawler.csproj", command[3])
        self.assertEqual(command[-2:], ["news", "COST"])

    def test_submit_command_includes_token(self):
        pipeline = _load_pipeline_module()
        config = lib.SubmitConfig(
            endpoint="http://127.0.0.1:8000/api/articles/auto-submit/",
            token="secret-token",
            section_slug="information-technology",
            timeout=45.0,
        )
        command = pipeline._submit_command(
            json_path=Path("news.json"),
            config=config,
            dry_run=False,
        )
        self.assertIn("--token", command)
        self.assertIn("secret-token", command)
        self.assertIn("--section-slug", command)
        self.assertIn("information-technology", command)

    def test_enrich_command_includes_model_and_urls(self):
        pipeline = _load_pipeline_module()
        command = pipeline._enrich_command(
            input_path=Path("in.json"),
            output_path=Path("out.json"),
            ollama_base_url="http://127.0.0.1:11434",
            ollama_model="vanilj/palmyra-fin-70b-32k:latest",
            ollama_timeout=120.0,
            ollama_retries=2,
            ollama_retry_delay=1.5,
            section_slug="information-technology",
        )
        self.assertIn("enrich-articles-ollama.py", command[1])
        self.assertIn("--ollama-model", command)
        self.assertIn("vanilj/palmyra-fin-70b-32k:latest", command)
        self.assertIn("--retry-delay", command)
        self.assertIn("1.5", command)
        self.assertIn("--section-slug", command)
        self.assertIn("information-technology", command)

    def test_main_passes_retry_delay_to_enrich(self):
        with mock.patch.object(self.pipeline, "_run_crawl", return_value=0), mock.patch.object(
            self.pipeline,
            "_run_enrich",
            return_value=0,
        ) as mock_enrich, mock.patch.object(
            self.pipeline,
            "_run_submit",
            return_value=(0, {"created": 0, "skipped": 0, "failed": 0, "results": []}),
        ), mock.patch.object(self.pipeline, "lib") as mock_lib:
            mock_lib.repo_root.return_value = _TOOLS_DIR.parent
            mock_lib.load_repo_env.return_value = None
            mock_lib.normalize_symbols.return_value = ["NVDA"]
            mock_lib.resolve_submit_config.return_value = lib.SubmitConfig(
                endpoint="http://127.0.0.1:8000/api/articles/auto-submit/",
                token="secret-token",
                section_slug="information-technology",
                timeout=60.0,
            )
            mock_lib.ensure_submit_config.return_value = None
            mock_lib.apply_submit_config_to_env.return_value = None

            exit_code = self.pipeline.main(
                ["--enrich-ollama", "--ollama-retry-delay", "2.75", "--dry-run", "NVDA"]
            )

        self.assertEqual(exit_code, 0)
        mock_enrich.assert_called_once()
        self.assertEqual(mock_enrich.call_args.kwargs["ollama_retry_delay"], 2.75)


class SubmitArticleCliTests(unittest.TestCase):
    def test_dry_run_maps_stock_crawler_json(self):
        cli = _TOOLS_DIR / "submit-article"
        payload = {
            "mode": "news",
            "tickers": [
                {
                    "symbol": "NVDA",
                    "alpacNews": [
                        {
                            "headline": "Chip rally",
                            "summary": "NVDA moved higher.",
                            "content": "Details here.",
                            "source": "Example",
                            "url": "https://example.com/nvda-1",
                            "symbols": ["NVDA"],
                            "tags": ["semiconductor"],
                            "seo_title": "NVDA chip rally",
                            "seo_description": "A short search description.",
                            "catalyst": "Bullish",
                            "section_slug": "information-technology",
                        }
                    ],
                }
            ],
        }
        input_path = _TOOLS_DIR / ".test-stock-crawler-output.json"
        input_path.write_text(json.dumps(payload), encoding="utf-8")
        try:
            proc = subprocess.run(
                [sys.executable, str(cli), "--input-file", str(input_path), "--dry-run"],
                capture_output=True,
                text=True,
                check=False,
                cwd=str(_TOOLS_DIR.parent),
            )
        finally:
            input_path.unlink(missing_ok=True)

        self.assertEqual(proc.returncode, 0, msg=proc.stderr)
        data = json.loads(proc.stdout)
        self.assertTrue(data.get("dry_run"))
        self.assertEqual(data.get("count"), 1)
        article = data["articles"][0]
        self.assertEqual(article["seo_title"], "NVDA chip rally")
        self.assertEqual(article["search_description"], "A short search description.")
        self.assertEqual(article["catalyst"], "Bullish")
        self.assertEqual(article["section_slug"], "information-technology")


if __name__ == "__main__":
    unittest.main()
