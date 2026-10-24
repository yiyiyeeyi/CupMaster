#!/usr/bin/env python3
"""Focused tests for Task 9C-5.13 aggregation and safety helpers."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("task9c5-13-targeted-retraining.py")
SPEC = importlib.util.spec_from_file_location("task9c5_13_test_subject", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def record(error: float, accepted: bool = True) -> dict:
    return {"positive": True, "presenceAccepted": accepted, "argmax": {"normalizedError": error}}


class TargetedRetrainingTest(unittest.TestCase):
    def test_forbidden_sessions_are_disjoint_from_allowlist(self) -> None:
        self.assertFalse(set(MODULE.SESSIONS) & MODULE.FORBIDDEN_SESSIONS)
        self.assertIn("session-014", MODULE.FORBIDDEN_SESSIONS)
        self.assertEqual(12, len(MODULE.SESSIONS))

    def test_quality_buckets_include_missing_presence_as_unusable(self) -> None:
        summary = MODULE.quality_buckets([
            record(0.01), record(0.04), record(0.10), record(0.01, accepted=False), record(0.30),
        ])
        self.assertEqual(1, summary["high"]["count"])
        self.assertEqual(1, summary["medium"]["count"])
        self.assertEqual(1, summary["low"]["count"])
        self.assertEqual(2, summary["unusable"]["count"])

    def test_tip_thresholds_use_all_positives_as_denominator(self) -> None:
        summary = MODULE.tip_summary([record(0.01), record(0.03), record(0.01, accepted=False)])
        self.assertAlmostEqual(1 / 3, summary["proportionAtOrBelow"]["0.02"])
        self.assertAlmostEqual(2 / 3, summary["proportionAtOrBelow"]["0.04"])


if __name__ == "__main__":
    unittest.main()
