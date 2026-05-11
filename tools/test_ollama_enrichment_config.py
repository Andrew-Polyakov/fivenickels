"""Tests for tools/ollama_enrichment_config.py."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


_TOOLS_DIR = Path(__file__).resolve().parent


def _load_config_module():
    spec = importlib.util.spec_from_file_location(
        "ollama_enrichment_config",
        _TOOLS_DIR / "ollama_enrichment_config.py",
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    assert spec.name is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class OllamaEnrichmentConfigTests(unittest.TestCase):
    def setUp(self):
        self.mod = _load_config_module()

    def test_default_prompts_render_placeholders(self):
        prompts = self.mod.default_prompts()
        system = prompts.render_system(taxonomy_rules="TAXONOMY")
        user = prompts.render_user(article_json='{"headline":"A"}')

        self.assertIn("TAXONOMY", system)
        self.assertNotIn("{taxonomy_rules}", system)
        self.assertIn('{"headline":"A"}', user)
        self.assertNotIn("{article_json}", user)

    def test_resolve_prompts_from_json_file(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "prompts.json"
            path.write_text(
                json.dumps(
                    {
                        "system": "SYSTEM {taxonomy_rules}",
                        "user": "USER {article_json}",
                    }
                ),
                encoding="utf-8",
            )
            prompts = self.mod.resolve_ollama_prompts(
                prompts_file=path,
                env={},
            )

        self.assertEqual(prompts.render_system(taxonomy_rules="X"), "SYSTEM X")
        self.assertEqual(prompts.render_user(article_json="Y"), "USER Y")

    def test_env_overrides_json_prompts(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "prompts.json"
            path.write_text(
                json.dumps({"system": "FROM FILE", "user": "FROM FILE USER"}),
                encoding="utf-8",
            )
            prompts = self.mod.resolve_ollama_prompts(
                prompts_file=path,
                env={
                    self.mod.ENV_SYSTEM_PROMPT: "ENV SYSTEM {taxonomy_rules}",
                    self.mod.ENV_USER_PROMPT: "ENV USER {article_json}",
                },
            )

        self.assertEqual(prompts.render_system(taxonomy_rules="Z"), "ENV SYSTEM Z")
        self.assertEqual(prompts.render_user(article_json="Q"), "ENV USER Q")


if __name__ == "__main__":
    unittest.main()
