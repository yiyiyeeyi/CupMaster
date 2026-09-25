import importlib.util
import sys
import unittest
from pathlib import Path


PATH = Path(__file__).with_name("task9c5-heldout-evaluation.py")
SPEC = importlib.util.spec_from_file_location("task9c5_heldout_evaluation", PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot import {PATH}")
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


class HeldoutMetricTests(unittest.TestCase):
    def test_visibility_intervals_are_half_open(self):
        self.assertTrue(module.visible_at(94.5))
        self.assertFalse(module.visible_at(116.5))

    def test_temporal_metrics_do_not_match_lost_across_next_entry(self):
        run = {
            "boundsSeconds": (0.0, 309.2),
            "transitions": [
                {"timestampMs": 117000.0, "to": "LOST", "reason": "presence_absent_confirmed"},
                {"timestampMs": 143000.0, "to": "REACQUIRED", "reason": "reacquisition_confirmed"},
            ],
            "records": [
                {"timestampMs": 116500.0, "emittedPoint": {"x": 10.0, "y": 10.0}, "presenceDecision": None},
                {"timestampMs": 117000.0, "emittedPoint": None, "presenceDecision": False},
            ],
            "segments": [{"start_ms": 94500.0, "end_ms": 116500.0}],
        }
        result = module.heldout_temporal_metrics(run)
        self.assertEqual(result["exitRecords"][0]["lostTimestampSeconds"], 117.0)
        self.assertIsNone(result["exitRecords"][1]["lostTimestampSeconds"])
        self.assertEqual(result["trueReacquisitions"], 1)

    def test_keypoint_summary_counts_detector_failure_as_miss(self):
        result = module.keypoint_summary([
            {
                "groundTruthPositive": True,
                "accepted": False,
                "pixelError": None,
                "normalizedError": None,
            },
            {
                "groundTruthPositive": False,
                "accepted": False,
                "pixelError": None,
                "normalizedError": None,
            },
        ])
        self.assertEqual(result["missRate"], 1.0)


if __name__ == "__main__":
    unittest.main()
