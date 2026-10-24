#!/usr/bin/env python3
"""Focused tests for Task 9C-5.16 metrics and safety."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("task9c5-16-finetune-study.py")
SPEC = importlib.util.spec_from_file_location("task9c5_16_test_subject", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FineTuneStudyTest(unittest.TestCase):
    def test_allowlist_excludes_sealed_and_external_sessions(self) -> None:
        self.assertFalse(set(MODULE.SESSIONS) & MODULE.FORBIDDEN_SESSIONS)
        self.assertEqual(12, len(MODULE.SESSIONS))

    def test_partial_learning_rate_is_substantially_smaller(self) -> None:
        self.assertLessEqual(MODULE.BACKBONE_LR, MODULE.HEAD_LR / 10)

    def test_tip_quality_is_not_presence_masked(self) -> None:
        records = [
            {"positive": True, "presenceAccepted": False, "argmax": {"normalizedError": 0.01}},
            {"positive": True, "presenceAccepted": True, "argmax": {"normalizedError": 0.10}},
            {"positive": False, "presenceAccepted": False, "argmax": {}},
        ]
        summary = MODULE.tip_quality(records)
        self.assertEqual(0.5, summary["proportionAtOrBelow"]["0.02"])
        self.assertEqual(0.0, summary["presenceGatedProportionAtOrBelow"]["0.02"])
        self.assertEqual(1.0, summary["proportionAtOrBelow"]["0.2"])


if __name__ == "__main__":
    unittest.main()
