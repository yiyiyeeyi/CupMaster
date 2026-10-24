#!/usr/bin/env python3
"""Tests for Task 9C-5.8 standalone spout recognition."""

import importlib.util
import sys
import unittest
from pathlib import Path

import torch


SCRIPT = Path(__file__).with_name("task9c5-8-standalone-spout.py")
SPEC = importlib.util.spec_from_file_location("task9c5_8_tested", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class StandaloneSpoutTests(unittest.TestCase):
    def test_bbox_intersection(self) -> None:
        self.assertEqual(
            MODULE.intersect_bbox(
                {"xMin": -2, "yMin": 4, "xMax": 12, "yMax": 20},
                {"xMin": 0, "yMin": 5, "xMax": 10, "yMax": 30},
            ),
            {"xMin": 0, "yMin": 5, "xMax": 10, "yMax": 20},
        )

    def test_valid_bbox_rejects_degenerate(self) -> None:
        self.assertTrue(MODULE.valid_bbox({"xMin": 0, "yMin": 0, "xMax": 5, "yMax": 5}))
        self.assertFalse(MODULE.valid_bbox({"xMin": 0, "yMin": 0, "xMax": 1, "yMax": 5}))

    def test_negative_only_batch_has_no_bbox_loss(self) -> None:
        raw = torch.zeros(2, 5, requires_grad=True)
        total, presence, bbox = MODULE.detector_loss(raw, torch.zeros(2), torch.zeros(2, 4))
        self.assertEqual(float(bbox.detach()), 0.0)
        self.assertAlmostEqual(float(total.detach()), float(presence.detach()))

    def test_primary_script_never_predicts_tip(self) -> None:
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("spout_tip", source)
        self.assertIn("point_target=(0.0, 0.0)", source)

    def test_allowlist_excludes_sealed_and_benchmark_sessions(self) -> None:
        self.assertNotIn("session-014", MODULE.SESSIONS)
        self.assertTrue(set(MODULE.SESSIONS).isdisjoint({f"session-{value:03d}" for value in range(5, 11)}))


if __name__ == "__main__":
    unittest.main()
