#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("task9c5-14b-compare.py")
SPEC = importlib.util.spec_from_file_location("task9c5_14b_compare_subject", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ComparisonTest(unittest.TestCase):
    def test_recognition_is_partitioned_by_water_metadata(self) -> None:
        annotations = {
            "off": {"selectionMetadata": {"waterOnHint": "no"}},
            "on": {"selectionMetadata": {"waterOnHint": "yes"}},
        }
        records = [
            {"frameId": "off", "positive": True, "presenceAccepted": False, "presenceProbability": 0.1},
            {"frameId": "on", "positive": True, "presenceAccepted": True, "presenceProbability": 0.9},
        ]
        self.assertEqual(0.0, MODULE.recognition(records, annotations, "no")["recall"])
        self.assertEqual(1.0, MODULE.recognition(records, annotations, "yes")["recall"])

    def test_corrected_identity_set_is_frozen(self) -> None:
        self.assertEqual(3, len(MODULE.CORRECTED_IDS))
        self.assertIn("session-019-t000000", MODULE.CORRECTED_IDS)


if __name__ == "__main__":
    unittest.main()
