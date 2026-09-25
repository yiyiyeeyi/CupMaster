import importlib.util
import random
import sys
import unittest
from pathlib import Path


PATH = Path(__file__).with_name("task9c3-roi-robustness.py")
SPEC = importlib.util.spec_from_file_location("task9c3_roi_robustness", PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot import {PATH}")
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


class RoiPolicyTests(unittest.TestCase):
    def test_expand_roi_pads_each_side_and_clamps(self):
        roi = module.expand_roi({"xMin": 10, "yMin": 20, "xMax": 30, "yMax": 60}, 100, 100, 0.5)
        self.assertEqual(roi, {"xMin": 0.0, "yMin": 0.0, "xMax": 40.0, "yMax": 80.0})

    def test_tip_safety_is_positive_inside_and_negative_outside(self):
        roi = {"xMin": 10.0, "yMin": 10.0, "xMax": 30.0, "yMax": 50.0}
        self.assertEqual(module.tip_safety({"x": 20, "y": 20}, roi), (True, 10.0, 0.5))
        contained, margin, normalized = module.tip_safety({"x": 35, "y": 20}, roi)
        self.assertFalse(contained)
        self.assertEqual(margin, -5.0)
        self.assertEqual(normalized, -0.25)

    def test_jitter_sampling_is_seeded_and_keeps_tip_visible(self):
        bbox = {"xMin": 100.0, "yMin": 100.0, "xMax": 300.0, "yMax": 200.0}
        tip = {"x": 270.0, "y": 170.0}
        first = module.sample_jittered_roi(bbox, tip, 500, 500, random.Random(module.SEED))
        second = module.sample_jittered_roi(bbox, tip, 500, 500, random.Random(module.SEED))
        self.assertEqual(first, second)
        self.assertTrue(first["xMin"] <= tip["x"] <= first["xMax"])
        self.assertTrue(first["yMin"] <= tip["y"] <= first["yMax"])


if __name__ == "__main__":
    unittest.main()
