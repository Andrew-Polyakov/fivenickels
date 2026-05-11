"""Tests for tools/taxonomy_catalog.py."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


_TOOLS_DIR = Path(__file__).resolve().parent


def _load_taxonomy_catalog():
    spec = importlib.util.spec_from_file_location(
        "taxonomy_catalog",
        _TOOLS_DIR / "taxonomy_catalog.py",
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class TaxonomyCatalogTests(unittest.TestCase):
    def setUp(self):
        self.mod = _load_taxonomy_catalog()

    def test_resolve_section_slug_maps_near_slug_to_gics(self):
        self.assertEqual(
            self.mod.resolve_section_slug("ai-and-technology"),
            "information-technology",
        )

    def test_resolve_section_slug_keeps_new_slug_when_no_match(self):
        self.assertEqual(
            self.mod.resolve_section_slug("quantum-computing"),
            "quantum-computing",
        )

    def test_section_prompt_lines_include_gics_slug(self):
        lines = "\n".join(self.mod.section_prompt_lines())
        self.assertIn("information-technology", lines)


if __name__ == "__main__":
    unittest.main()
