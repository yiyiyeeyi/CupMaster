import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("task9c5-6-spout-structure.py")
SPEC = importlib.util.spec_from_file_location("task9c5_6_structure", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SpoutStructureTests(unittest.TestCase):
    def test_padding_is_clamped_to_manual_search_region(self):
        bbox = {"xMin": 10, "yMin": 20, "xMax": 50, "yMax": 60}
        search = {"xMin": 0, "yMin": 0, "xMax": 55, "yMax": 100}
        self.assertEqual(
            MODULE.pad_bbox(bbox, 0.30, search),
            {"xMin": 0, "yMin": 8, "xMax": 55, "yMax": 72},
        )

    def test_structure_bbox_is_intersected_with_search(self):
        annotation = {"objects": [{"bbox": {"xMin": -10, "yMin": 10, "xMax": 80, "yMax": 90}}]}
        search = {"xMin": 0, "yMin": 20, "xMax": 70, "yMax": 100}
        result = MODULE.structure_annotation(annotation, search)
        self.assertEqual(result["objects"][0]["bbox"], {"xMin": 0, "yMin": 20, "xMax": 70, "yMax": 90})
        self.assertEqual(annotation["objects"][0]["bbox"]["xMin"], -10)

    def test_keypoint_helper_is_not_valid_for_structure_bbox_targets(self):
        source = SCRIPT.read_text(encoding="utf-8")
        structure_body = source.split("def structure_examples(", 1)[1].split("def train_fixed(", 1)[0]
        self.assertIn("bbox_target=baseline.bbox_to_input", structure_body)
        self.assertNotIn("experiment.make_example", structure_body)

    def test_valid_bbox_rejects_degenerate_geometry(self):
        self.assertTrue(MODULE.valid_bbox({"xMin": 0, "yMin": 0, "xMax": 10, "yMax": 10}))
        self.assertFalse(MODULE.valid_bbox({"xMin": 5, "yMin": 0, "xMax": 5, "yMax": 10}))

    def test_allowlist_excludes_sealed_and_benchmark_sessions(self):
        self.assertNotIn("session-014", MODULE.SESSIONS)
        self.assertTrue(set(MODULE.SESSIONS).isdisjoint({f"session-{value:03d}" for value in range(5, 11)}))


if __name__ == "__main__":
    unittest.main()
