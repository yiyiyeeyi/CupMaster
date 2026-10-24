#!/usr/bin/env python3
"""Tests for Task 9C-5.7 independent presence and heatmap localization."""

import importlib.util
import sys
import unittest
from pathlib import Path

import torch


SCRIPT = Path(__file__).with_name("task9c5-7-presence-heatmap.py")
SPEC = importlib.util.spec_from_file_location("task9c5_7_tested", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class PresenceHeatmapTests(unittest.TestCase):
    def test_gaussian_is_normalized_and_centered(self) -> None:
        heatmap = MODULE.gaussian_heatmap((0.5, 0.5))
        self.assertAlmostEqual(float(heatmap.sum()), 1.0, places=5)
        decoded = MODULE.decode_heatmap(torch.log(heatmap.clamp_min(1e-12)))
        self.assertAlmostEqual(decoded["softArgmax"][0], 0.5, places=3)
        self.assertAlmostEqual(decoded["softArgmax"][1], 0.5, places=3)

    def test_negative_batch_masks_localization_loss(self) -> None:
        presence_logits = torch.zeros(2)
        heatmaps = torch.randn(2, 28, 28, requires_grad=True)
        total, presence, localization = MODULE.separate_loss(
            presence_logits, heatmaps, torch.zeros(2), torch.zeros(2, 28, 28),
        )
        self.assertEqual(float(localization.detach()), 0.0)
        self.assertAlmostEqual(float(total.detach()), float(presence.detach()))

    def test_auc_and_average_precision(self) -> None:
        labels = [False, True, False, True]
        scores = [0.1, 0.8, 0.2, 0.9]
        self.assertEqual(MODULE.binary_auc(labels, scores), 1.0)
        self.assertEqual(MODULE.average_precision(labels, scores), 1.0)

    def test_head_has_independent_outputs(self) -> None:
        head = MODULE.PresenceHeatmapHead(576).eval()
        presence, heatmap = head(torch.zeros(2, 576, 7, 7))
        self.assertEqual(tuple(presence.shape), (2,))
        self.assertEqual(tuple(heatmap.shape), (2, 28, 28))

    def test_diagnostic_classes(self) -> None:
        self.assertEqual(MODULE.diagnostic_class(0.1, 0.1, 0.5), "correctly_concentrated_near_gt")
        self.assertEqual(MODULE.diagnostic_class(0.8, 0.001, 0.5), "effectively_absent")
        self.assertEqual(MODULE.diagnostic_class(0.8, 0.01, 0.9), "diffuse")
        self.assertEqual(MODULE.diagnostic_class(0.8, 0.01, 0.5), "concentrated_on_wrong_structure")


if __name__ == "__main__":
    unittest.main()
