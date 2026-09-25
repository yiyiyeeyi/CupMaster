import importlib.util
import json
import sys
import unittest
from pathlib import Path

import cv2
import numpy as np


PATH = Path(__file__).with_name("task9c4-hybrid-video.py")
SPEC = importlib.util.spec_from_file_location("task9c4_hybrid_video", PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot import {PATH}")
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


class GeometryTests(unittest.TestCase):
    def test_numpy_scalars_are_json_serializable(self):
        encoded = json.dumps({"value": np.float32(0.5)}, default=module.json_default)
        self.assertEqual(encoded, '{"value": 0.5}')

    def test_expand_roi_is_per_side_and_clamped(self):
        result = module.expand_roi(
            {"xMin": 10.0, "yMin": 20.0, "xMax": 30.0, "yMax": 60.0},
            100,
            100,
            0.5,
        )
        self.assertEqual(result, {"xMin": 0.0, "yMin": 0.0, "xMax": 40.0, "yMax": 80.0})

    def test_translate_bbox_preserves_size_at_boundary(self):
        result = module.translate_bbox(
            {"xMin": 70.0, "yMin": 70.0, "xMax": 100.0, "yMax": 90.0},
            40.0,
            40.0,
            120,
            100,
        )
        self.assertEqual(result, {"xMin": 90.0, "yMin": 80.0, "xMax": 120.0, "yMax": 100.0})


class LkTrackerTests(unittest.TestCase):
    def test_forward_backward_tracker_recovers_small_translation(self):
        previous = np.zeros((160, 160), dtype=np.uint8)
        for y in range(55, 106, 10):
            for x in range(55, 106, 10):
                cv2.circle(previous, (x, y), 2, 255, -1)
        matrix = np.float32([[1, 0, 3], [0, 1, 2]])
        current = cv2.warpAffine(previous, matrix, (160, 160))
        tracker = module.LkTracker()
        bbox = {"xMin": 40.0, "yMin": 40.0, "xMax": 120.0, "yMax": 120.0}
        self.assertTrue(tracker.initialize(previous, {"x": 80.0, "y": 80.0}, bbox))
        result = tracker.update(current)
        self.assertTrue(result.valid)
        self.assertAlmostEqual(result.point["x"], 83.0, delta=0.5)
        self.assertAlmostEqual(result.point["y"], 82.0, delta=0.5)


class TemporalMetricTests(unittest.TestCase):
    def test_lost_reacquisition_and_segments_are_measured(self):
        run = {
            "window": "primary",
            "segments": [
                {"start_ms": 8500.0, "end_ms": 22500.0},
                {"start_ms": 31500.0, "end_ms": 45750.0},
            ],
            "transitions": [
                {"timestampMs": 22500.0, "to": "LOST"},
                {"timestampMs": 31500.0, "to": "REACQUIRED"},
                {"timestampMs": 45750.0, "to": "LOST"},
            ],
        }
        result = module.temporal_metrics(run)
        self.assertEqual(result["falseSegmentSplits"], 0)
        self.assertEqual(result["falseSegmentMerges"], 0)
        self.assertEqual(result["lostCensoredFailures"], 0)
        self.assertAlmostEqual(result["lostDelaySeconds"]["median"], 0.125)
        self.assertAlmostEqual(result["reacquisitionLatencySeconds"]["median"], 0.25)


if __name__ == "__main__":
    unittest.main()
