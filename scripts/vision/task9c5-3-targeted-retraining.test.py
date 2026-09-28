import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("task9c5-3-targeted-retraining.py")
SPEC = importlib.util.spec_from_file_location("task9c5_3_retraining", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def passing_fold():
    return {
        "globalToLocal": {
            "positiveLocateRate": 0.9,
            "roiContainmentRate": 1.0,
            "negativeFalsePositiveRate": 0.0,
            "normalizedError": {"mean": 0.1, "median": 0.1, "p90": 0.2},
        },
        "presence": {"jointConfidenceRule": {"positiveRecall": 0.9, "negativeSpecificity": 1.0}},
    }


class TargetedRetrainingTests(unittest.TestCase):
    def test_session_allowlist_excludes_sealed_and_benchmark_sessions(self):
        self.assertNotIn("session-014", MODULE.SESSIONS)
        self.assertTrue(set(MODULE.SESSIONS).isdisjoint(MODULE.EXTERNAL_BENCHMARK_SESSIONS))

    def test_gate_passes_only_when_every_session_passes(self):
        folds = {session: passing_fold() for session in MODULE.SESSIONS}
        self.assertTrue(MODULE.evaluate_gate(folds)["passed"])
        folds["session-004"]["globalToLocal"]["normalizedError"]["mean"] = 0.31
        result = MODULE.evaluate_gate(folds)
        self.assertFalse(result["passed"])
        self.assertIn("session-004: normalized mean", result["failures"])


if __name__ == "__main__":
    unittest.main()

