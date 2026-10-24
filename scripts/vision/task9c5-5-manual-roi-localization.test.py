import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("task9c5-5-manual-roi-localization.py")
SPEC = importlib.util.spec_from_file_location("task9c5_5_manual_roi", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ManualRoiTests(unittest.TestCase):
    def test_balanced_search_region_matches_frozen_contract(self):
        frame = {"frameId": "f", "width": 1080, "height": 1920}
        annotation = {"dripper": {"centerX": 500, "centerY": 700, "radiusX": 200, "radiusY": 128}}
        region = MODULE.search_region(annotation, frame, "balanced")
        self.assertEqual((region["xMin"], region["yMin"], region["xMax"], region["yMax"]), (60, 252, 940, 948))
        self.assertEqual(region["retainedAreaRatio"], 1)

    def test_search_region_clamps_and_reports_retained_area(self):
        frame = {"frameId": "f", "width": 100, "height": 200}
        annotation = {"dripper": {"centerX": 10, "centerY": 20, "radiusX": 20, "radiusY": 20}}
        region = MODULE.search_region(annotation, frame, "balanced")
        self.assertEqual((region["xMin"], region["yMin"]), (0, 0))
        self.assertLess(region["retainedAreaRatio"], 0.8)

    def test_local_roi_is_bounded_by_manual_search_region(self):
        bounds = {"xMin": 100, "yMin": 200, "xMax": 500, "yMax": 800}
        roi = MODULE.bounded_square((-1000, 2000), 260, bounds)
        self.assertEqual(roi, {"xMin": 100, "yMin": 670, "xMax": 230, "yMax": 800})

    def test_session_allowlist_excludes_sealed_and_benchmark_sessions(self):
        self.assertNotIn("session-014", MODULE.SESSIONS)
        self.assertTrue(set(MODULE.SESSIONS).isdisjoint({f"session-{value:03d}" for value in range(5, 11)}))


if __name__ == "__main__":
    unittest.main()

