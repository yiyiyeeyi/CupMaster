#!/usr/bin/env python3
"""Tests for Task 9C-5.9 CVAT centerline normalization."""

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("task9c5-9-normalize-centerline.py")
SPEC = importlib.util.spec_from_file_location("task9c5_9_normalize_tested", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class CenterlineNormalizationTests(unittest.TestCase):
    def test_parse_points_preserves_order(self) -> None:
        self.assertEqual(
            MODULE.parse_points("1.5,2.5;3,4"),
            [{"x": 1.5, "y": 2.5}, {"x": 3.0, "y": 4.0}],
        )

    def test_line_length(self) -> None:
        self.assertEqual(MODULE.line_length([{"x": 0, "y": 0}, {"x": 3, "y": 4}]), 5.0)

    def test_duplicate_consecutive_points(self) -> None:
        points = [{"x": 0, "y": 0}, {"x": 1, "y": 1}, {"x": 1, "y": 1}]
        self.assertEqual(MODULE.consecutive_duplicate_indexes(points), [2])

    def test_self_intersection(self) -> None:
        points = [{"x": 0, "y": 0}, {"x": 2, "y": 2}, {"x": 0, "y": 2}, {"x": 2, "y": 0}]
        self.assertEqual(MODULE.self_intersections(points), [(0, 2)])

    def test_distribution_uses_observed_p90(self) -> None:
        result = MODULE.distribution(range(1, 11))
        self.assertEqual(result["median"], 5.5)
        self.assertEqual(result["p90"], 9)

    def test_session_allowlist_excludes_sealed_and_benchmark(self) -> None:
        self.assertNotIn("session-014", MODULE.SESSIONS)
        self.assertTrue(set(MODULE.SESSIONS).isdisjoint({f"session-{value:03d}" for value in range(5, 11)}))


if __name__ == "__main__":
    unittest.main()
