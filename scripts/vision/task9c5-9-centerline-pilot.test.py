#!/usr/bin/env python3
"""Tests for the Task 9C-5.9 centerline pilot representation."""

import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np
import torch


SCRIPT = Path(__file__).with_name("task9c5-9-centerline-pilot.py")
SPEC = importlib.util.spec_from_file_location("task9c5_9_centerline_tested", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class CenterlinePilotTests(unittest.TestCase):
    def test_soft_tube_peaks_on_line(self) -> None:
        target = MODULE.soft_tube([(0.0, 0.5), (1.0, 0.5)])
        self.assertGreater(float(target[28, 28]), 0.9)
        self.assertLess(float(target[0, 28]), 1e-6)

    def test_tip_gaussian_is_normalized(self) -> None:
        target = MODULE.tip_gaussian((0.25, 0.75))
        self.assertAlmostEqual(float(target.sum()), 1.0, places=5)

    def test_largest_component_reports_coherence(self) -> None:
        mask = np.zeros((8, 8), dtype=bool)
        mask[1, 1:4] = True
        mask[6, 6] = True
        selected, coherence, count = MODULE.largest_component(mask)
        self.assertEqual(int(selected.sum()), 3)
        self.assertEqual(count, 2)
        self.assertAlmostEqual(coherence, 0.75)

    def test_losses_mask_tip_on_negative_only_batch(self) -> None:
        presence = torch.zeros(2)
        lines = torch.zeros(2, MODULE.HEATMAP_SIZE, MODULE.HEATMAP_SIZE)
        tips = torch.zeros_like(lines)
        loss, components = MODULE.pilot_loss(presence, lines, lines, presence, lines, tips)
        self.assertTrue(torch.isfinite(loss))
        self.assertEqual(components["tipSpatialCrossEntropy"], 0.0)

    def test_session_allowlist_excludes_sealed_and_benchmark(self) -> None:
        self.assertNotIn("session-014", MODULE.SESSIONS)
        self.assertTrue(set(MODULE.SESSIONS).isdisjoint(MODULE.FORBIDDEN))


if __name__ == "__main__":
    unittest.main()
