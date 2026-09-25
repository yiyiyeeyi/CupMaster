import importlib.util
import csv
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("task9c5-2-global-local-keypoint.py")
SPEC = importlib.util.spec_from_file_location("task9c5_2", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GlobalLocalPolicyTests(unittest.TestCase):
    def test_square_roi_is_centered_then_clamped(self):
        self.assertEqual(
            MODULE.square_roi((50, 40), 200, 300, 0.5),
            {"xMin": 0.0, "yMin": 0.0, "xMax": 100.0, "yMax": 90.0},
        )

    def test_roi_safety_is_positive_inside_and_negative_outside(self):
        roi = {"xMin": 10.0, "yMin": 20.0, "xMax": 50.0, "yMax": 60.0}
        self.assertEqual(MODULE.roi_safety({"x": 30.0, "y": 30.0}, roi), (True, 10.0))
        inside, margin = MODULE.roi_safety({"x": 55.0, "y": 30.0}, roi)
        self.assertFalse(inside)
        self.assertEqual(margin, -5.0)

    def test_positive_jitter_is_seeded_and_contains_tip(self):
        tip = {"x": 300.0, "y": 140.0}
        first = MODULE.jittered_positive_roi(tip, 1080, 1920, 0.5, __import__("random").Random(MODULE.SEED))
        second = MODULE.jittered_positive_roi(tip, 1080, 1920, 0.5, __import__("random").Random(MODULE.SEED))
        self.assertEqual(first, second)
        self.assertTrue(MODULE.point_in_roi(tip, first))

    def test_pearson_handles_constant_inputs(self):
        self.assertIsNone(MODULE.pearson([1.0, 1.0, 1.0], [0.0, 1.0, 2.0]))

    def test_audit_csv_preserves_boolean_boundary_flag(self):
        fields = [
            "frameId", "session", "positive", "modeBKeypointAccepted", "paddedTipContained",
            *MODULE.FEATURE_NAMES, "modeBKeypointNormalizedError",
        ]
        row = {field: "0.25" for field in fields}
        row.update({
            "frameId": "frame-1", "session": "session-004", "positive": "True",
            "modeBKeypointAccepted": "False", "paddedTipContained": "True",
            "boundaryTouchTop": "True", "modeBKeypointNormalizedError": "0.4",
        })
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "audit.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                writer.writerow(row)
            parsed = MODULE.load_audit_csv(path)[0]
        self.assertIs(parsed["boundaryTouchTop"], True)
        self.assertEqual(parsed["dripperRadiusImageWidth"], 0.25)
        self.assertEqual(parsed["modeBKeypointNormalizedError"], 0.4)


if __name__ == "__main__":
    unittest.main()
