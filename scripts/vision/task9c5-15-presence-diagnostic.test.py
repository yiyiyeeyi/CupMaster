#!/usr/bin/env python3
"""Focused unit tests for Task 9C-5.15 diagnostic helpers."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("task9c5-15-presence-diagnostic.py")
SPEC = importlib.util.spec_from_file_location("task9c5_15_test_subject", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def record(positive: bool, accepted: bool, probability: float = 0.5, error: float = 0.1) -> dict:
    value = {
        "frameId": "frame", "session": "session-015", "positive": positive,
        "presenceAccepted": accepted, "presenceProbability": probability,
        "argmax": {},
    }
    if positive:
        value["argmax"]["normalizedError"] = error
    return value


class PresenceDiagnosticTest(unittest.TestCase):
    def test_session_allowlist_excludes_sealed_and_external_sessions(self) -> None:
        self.assertFalse(set(MODULE.SESSIONS) & MODULE.FORBIDDEN_SESSIONS)
        self.assertIn("session-014", MODULE.FORBIDDEN_SESSIONS)
        self.assertEqual(12, len(MODULE.SESSIONS))

    def test_presence_summary_uses_true_class_denominators(self) -> None:
        summary = MODULE.presence_summary([
            record(True, True), record(True, False), record(False, False), record(False, True),
        ])
        self.assertEqual(0.5, summary["recall"])
        self.assertEqual(0.5, summary["specificity"])
        self.assertEqual(1, summary["falsePresent"])
        self.assertEqual(1, summary["falseAbsent"])

    def test_tip_summary_distinguishes_presence_gating(self) -> None:
        summary = MODULE.tip_summary([
            record(True, True, error=0.05), record(True, False, error=0.01), record(False, False),
        ])
        self.assertEqual(2, summary["normalizedErrorAllPositives"]["count"])
        self.assertEqual(1, summary["normalizedErrorPresenceAccepted"]["count"])
        self.assertEqual(0.5, summary["usableAt0.20"])


if __name__ == "__main__":
    unittest.main()
