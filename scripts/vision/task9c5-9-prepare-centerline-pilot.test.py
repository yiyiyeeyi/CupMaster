#!/usr/bin/env python3
"""Tests for Task 9C-5.9 centerline pilot package selection."""

import importlib.util
import sys
import unittest
from collections import Counter
from pathlib import Path


SCRIPT = Path(__file__).with_name("task9c5-9-prepare-centerline-pilot.py")
SPEC = importlib.util.spec_from_file_location("task9c5_9_tested", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class CenterlinePilotPackageTests(unittest.TestCase):
    def test_selection_has_expected_size_and_session_counts(self) -> None:
        ids = MODULE.selected_frame_ids()
        self.assertEqual(len(ids), 62)
        self.assertEqual(len(set(ids)), 62)
        counts = Counter(frame_id[:11] for frame_id in ids)
        self.assertEqual(dict(counts), MODULE.EXPECTED_COUNTS)

    def test_selection_excludes_sealed_and_benchmark_sessions(self) -> None:
        sessions = set(MODULE.SELECTED)
        self.assertTrue(sessions.isdisjoint(MODULE.FORBIDDEN))
        self.assertEqual(sessions, set(MODULE.SESSIONS))

    def test_critical_sessions_outnumber_each_reference_session(self) -> None:
        for session in ("session-004", "session-011", "session-012", "session-013"):
            self.assertGreater(MODULE.EXPECTED_COUNTS[session], MODULE.EXPECTED_COUNTS["session-001"])

    def test_cvat_instructions_freeze_polyline_order(self) -> None:
        instructions = MODULE.annotation_instructions()
        self.assertIn("gooseneck_spout_centerline", instructions)
        self.assertIn("Point 0 must be", instructions)
        self.assertIn("outlet → kettle side", instructions)
        self.assertIn("Do not begin training", instructions)

    def test_no_centerline_autogeneration_exists(self) -> None:
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("model prediction", source.lower())
        self.assertNotIn("bbox_to_centerline", source)

    def test_package_filename_supports_both_source_schemas(self) -> None:
        self.assertEqual(MODULE.package_filename({"frameId": "a", "filename": "a.jpg"}), "a.jpg")
        self.assertEqual(MODULE.package_filename({"frameId": "b", "path": "frames/b.jpg"}), "b.jpg")


if __name__ == "__main__":
    unittest.main()
