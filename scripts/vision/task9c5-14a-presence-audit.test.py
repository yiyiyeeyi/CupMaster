#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("task9c5-14a-presence-audit.py")
SPEC = importlib.util.spec_from_file_location("task9c5_14a_test_subject", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class PresenceAuditTest(unittest.TestCase):
    def test_classification_partition_is_complete(self) -> None:
        self.assertEqual(3, len(MODULE.POSSIBLE_MISLABELS))
        self.assertEqual(24, len(MODULE.TRUE_NEGATIVE_CONTENT))
        self.assertFalse(set(MODULE.POSSIBLE_MISLABELS) & set(MODULE.TRUE_NEGATIVE_CONTENT))

    def test_water_off_frames_are_in_review_set(self) -> None:
        self.assertIn("session-019-t000000", MODULE.POSSIBLE_MISLABELS)
        self.assertIn("session-019-t000500", MODULE.POSSIBLE_MISLABELS)


if __name__ == "__main__":
    unittest.main()
