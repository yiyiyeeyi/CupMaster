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

    def test_binary_presence_metrics_report_both_error_types(self):
        result = module.binary_presence_metrics([0.9, 0.2, 0.8, 0.1], [1, 1, 0, 0], 0.5)
        self.assertEqual(result["accuracy"], 0.5)
        self.assertEqual(result["positiveRecall"], 0.5)
        self.assertEqual(result["negativeSpecificity"], 0.5)
        self.assertEqual(result["falsePresentRate"], 0.5)
        self.assertEqual(result["falseAbsentRate"], 0.5)

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


class PresenceGateTests(unittest.TestCase):
    @staticmethod
    def summary(false_lost_count):
        return {
            "canonicalTemporal": {
                "trueExits": 3,
                "trueExitsReachingLost": 3,
                "segmentsCrossingKnownAbsence": 0,
                "trueReentries": 1,
                "trueReacquisitions": 1,
                "falseLostCount": false_lost_count,
            },
            "localization": {"negativeFalsePositiveCount": 0},
            "invocationsPerVideoSecond": {"keypoint": 5.0},
        }

    def test_presence_gate_allows_no_increase_from_frozen_false_lost_baseline(self):
        self.assertTrue(module.presence_gate_pass(self.summary(3)))
        self.assertFalse(module.presence_gate_pass(self.summary(4)))

    def test_decision_uses_binary_gate_when_detector_adds_false_split(self):
        decision = module.presence_gate_decision({"A": self.summary(4), "B": self.summary(3)})
        self.assertEqual(decision["selected"], "B")
        self.assertEqual(decision["falseLostDelta"], {"A": 1, "B": 0})

    def test_two_absent_observations_end_segment_despite_valid_keypoint(self):
        class FakeAdapters:
            def presence_classifier(self, frame):
                return {"accepted": False, "confidence": 0.1}

            def keypoint(self, frame, roi):
                return {"accepted": True, "confidence": 0.99, "point": {"x": 50.0, "y": 50.0}}

        runner = module.HybridRunner("B", 60.0, FakeAdapters(), presence_gate="B")
        runner.state.state = "TRACKING"
        runner.state.current_bbox = {"xMin": 20.0, "yMin": 20.0, "xMax": 80.0, "yMax": 80.0}
        runner.state.last_trusted = {"x": 50.0, "y": 50.0}
        runner.state.last_trusted_ms = 0.0
        segment = module.Segment(1, 0.0)
        runner.state.open_segment = segment
        runner.state.segments.append(segment)
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        first = runner.process(frame, 0, 0.0)
        second = runner.process(frame, 12, 200.0)
        self.assertEqual(first["state"], "TRACKING")
        self.assertEqual(second["state"], "LOST")
        self.assertEqual(runner.state.segments[0].end_reason, "presence_absent_confirmed")


if __name__ == "__main__":
    unittest.main()
