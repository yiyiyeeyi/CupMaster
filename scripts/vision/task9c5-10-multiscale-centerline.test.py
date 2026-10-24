#!/usr/bin/env python3
"""Tests for Task 9C-5.10 multi-scale centerline pilot."""

import importlib.util
import sys
import unittest
from pathlib import Path

import torch


SCRIPT = Path(__file__).with_name("task9c5-10-multiscale-centerline.py")
SPEC = importlib.util.spec_from_file_location("task9c5_10_multiscale_tested", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class MultiScaleCenterlineTests(unittest.TestCase):
    def test_frozen_candidates_are_exactly_b_c_d(self) -> None:
        self.assertEqual(set(MODULE.CANDIDATES), {
            "high_res_112", "multi_scale_56", "multi_scale_high_res_112",
        })

    def test_sigma_scales_with_resolution(self) -> None:
        self.assertEqual(MODULE.CANDIDATES["high_res_112"]["sigma"], 3.0)
        self.assertEqual(MODULE.CANDIDATES["multi_scale_56"]["sigma"], 1.5)

    def test_curve_gating_suppresses_endpoint_off_curve(self) -> None:
        line = torch.full((1, 4, 4), -10.0)
        line[0, 2, 2] = 10.0
        endpoint = torch.zeros_like(line)
        gated = endpoint + torch.nn.functional.logsigmoid(line)
        self.assertGreater(float(gated[0, 2, 2]), float(gated[0, 0, 0]) + 9)

    def test_head_output_shapes(self) -> None:
        intermediate = torch.zeros(2, MODULE.INTERMEDIATE_CHANNELS, 28, 28)
        final = torch.zeros(2, MODULE.FINAL_CHANNELS, 7, 7)
        for name, configuration in MODULE.CANDIDATES.items():
            with self.subTest(name=name):
                head = MODULE.MultiScaleCenterlineHead(configuration["multiScale"], configuration["resolution"]).eval()
                presence, centerline, endpoint, gated = head(intermediate, final)
                self.assertEqual(tuple(presence.shape), (2,))
                self.assertEqual(tuple(centerline.shape), (2, configuration["resolution"], configuration["resolution"]))
                self.assertEqual(endpoint.shape, gated.shape)

    def test_session_allowlist_excludes_sealed_and_benchmark(self) -> None:
        self.assertNotIn("session-014", MODULE.SESSIONS)
        self.assertTrue(set(MODULE.SESSIONS).isdisjoint(MODULE.FORBIDDEN))

    def test_group_metrics_accepts_task9c59_tip_schema(self) -> None:
        record = {
            "frameId": "frame", "positive": True, "presenceAccepted": True,
            "centerline": {"gtCoverageWithinTolerance": 0.5, "predictedPrecisionWithinTolerance": 0.75},
            "tip": {"usable": True},
        }
        result = MODULE.group_metrics([record], {"frame"})
        self.assertEqual(result["endpointUsableLocateRate"], 1.0)


if __name__ == "__main__":
    unittest.main()
