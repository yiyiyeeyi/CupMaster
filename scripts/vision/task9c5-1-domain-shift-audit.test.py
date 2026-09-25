import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np


PATH = Path(__file__).with_name("task9c5-1-domain-shift-audit.py")
SPEC = importlib.util.spec_from_file_location("task9c5_1_domain_shift_audit", PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot import {PATH}")
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


class AuditTests(unittest.TestCase):
    def test_geometry_normalizes_tip_and_detects_top_truncation(self):
        frame = {"width": 100, "height": 200}
        annotation = {
            "objects": [{
                "bbox": {"xMin": 10.0, "yMin": 0.0, "xMax": 50.0, "yMax": 80.0},
                "spoutTip": {"x": 40.0, "y": 60.0},
            }],
            "dripper": {"centerX": 50.0, "centerY": 100.0, "radiusX": 20.0, "radiusY": 20.0},
        }
        result = module.geometry_diagnostics(frame, annotation)
        self.assertEqual(result["boundaryTouchTop"], True)
        self.assertEqual(result["boundaryTouchCount"], 1)
        self.assertAlmostEqual(result["tipXNorm"], 0.4)
        self.assertAlmostEqual(result["tipRelativeX"], 0.75)

    def test_image_statistics_are_deterministic(self):
        image = np.zeros((10, 10, 3), dtype=np.uint8)
        image[:, 5:] = 255
        result = module.image_diagnostics(image, {"xMin": 0, "yMin": 0, "xMax": 10, "yMax": 10})
        self.assertAlmostEqual(result["meanLuminance"], 127.5)
        self.assertAlmostEqual(result["highlightFraction"], 0.5)
        self.assertAlmostEqual(result["darkFraction"], 0.5)

    def test_pearson_handles_constant_features(self):
        self.assertIsNone(module.pearson([(1.0, 2.0), (1.0, 3.0), (1.0, 4.0)]))
        self.assertAlmostEqual(module.pearson([(1.0, 2.0), (2.0, 4.0), (3.0, 6.0)]), 1.0)


if __name__ == "__main__":
    unittest.main()
