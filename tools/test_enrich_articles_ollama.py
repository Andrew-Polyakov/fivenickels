"""Tests for tools/enrich-articles-ollama.py."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


_TOOLS_DIR = Path(__file__).resolve().parent


def _load_enrich_module():
    spec = importlib.util.spec_from_file_location(
        "enrich_articles_ollama",
        _TOOLS_DIR / "enrich-articles-ollama.py",
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class EnrichArticlesOllamaTests(unittest.TestCase):
    def setUp(self):
        self.mod = _load_enrich_module()

    def test_apply_enrichment_maps_sentiment_to_catalyst(self):
        news = {
            "headline": "Original title",
            "summary": "Original summary",
            "content": "Original body",
            "tags": ["tech"],
        }
        generated = {
            "reworded_title": "Reworded title",
            "reworded_summary": "Reworded summary",
            "reworded_content": "Reworded body",
            "tags": ["ai", "equities"],
            "section_slug": "information-technology",
            "seo_title": "SEO title",
            "seo_description": "SEO desc",
            "catalyst_sentiment": "bullish",
        }

        self.mod._apply_enrichment(news=news, generated=generated, section_override=None)

        self.assertEqual(news["headline"], "Reworded title")
        self.assertEqual(news["summary"], "Reworded summary")
        self.assertEqual(news["content"], "Reworded body")
        self.assertEqual(news["tags"], ["ai", "equities"])
        self.assertEqual(news["section_slug"], "information-technology")
        self.assertEqual(news["seo_title"], "SEO title")
        self.assertEqual(news["seo_description"], "SEO desc")
        self.assertEqual(news["catalyst"], "Bullish")

    def test_apply_enrichment_maps_near_section_slug_to_gics(self):
        news = {
            "headline": "Original title",
            "summary": "Original summary",
            "content": "Original body",
        }
        generated = {
            "reworded_title": "Reworded title",
            "reworded_summary": "Reworded summary",
            "reworded_content": "Reworded body",
            "tags": ["ai"],
            "section_slug": "ai-and-technology",
            "seo_title": "SEO title",
            "seo_description": "SEO desc",
            "catalyst_sentiment": "neutral",
        }

        self.mod._apply_enrichment(news=news, generated=generated, section_override=None)

        self.assertEqual(news["section_slug"], "information-technology")

    def test_apply_enrichment_drops_catalyst_for_neutral(self):
        news = {
            "headline": "Original title",
            "summary": "Original summary",
            "content": "Original body",
            "catalyst": "Bullish",
        }
        generated = {
            "reworded_title": "",
            "reworded_summary": "",
            "reworded_content": "",
            "tags": [],
            "section_slug": "",
            "seo_title": "",
            "seo_description": "",
            "catalyst_sentiment": "neutral",
        }

        self.mod._apply_enrichment(
            news=news,
            generated=generated,
            section_override="information-technology",
        )

        self.assertNotIn("catalyst", news)
        self.assertEqual(news["section_slug"], "information-technology")

    def test_main_writes_submit_compatible_shape(self):
        payload = {
            "mode": "news",
            "tickers": [
                {
                    "symbol": "NVDA",
                    "alpacNews": [
                        {
                            "headline": "Old",
                            "summary": "Old summary",
                            "content": "Old body",
                            "source": "Example",
                            "url": "https://example.com/nvda-1",
                            "symbols": ["NVDA"],
                            "tags": ["chips"],
                        }
                    ],
                }
            ],
        }
        with tempfile.TemporaryDirectory() as td:
            input_path = Path(td) / "in.json"
            output_path = Path(td) / "out.json"
            input_path.write_text(json.dumps(payload), encoding="utf-8")

            original = self.mod._ollama_chat
            self.mod._ollama_chat = lambda **_: {
                "reworded_title": "New title",
                "reworded_summary": "New summary",
                "reworded_content": "New body",
                "tags": ["Semiconductors", "AI"],
                "section_slug": "information-technology",
                "seo_title": "NVDA update",
                "seo_description": "NVDA article SEO description.",
                "catalyst_sentiment": "bearish",
            }
            try:
                exit_code = self.mod.main(
                    ["--input-file", str(input_path), "--output-file", str(output_path)]
                )
            finally:
                self.mod._ollama_chat = original

            self.assertEqual(exit_code, 0)
            out = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertIn("tickers", out)
            article = out["tickers"][0]["alpacNews"][0]
            self.assertEqual(article["headline"], "New title")
            self.assertEqual(article["seo_title"], "NVDA update")
            self.assertEqual(article["catalyst"], "Bearish")
            self.assertIn("ollama_enrichment", out)


if __name__ == "__main__":
    unittest.main()
