import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("task9c5-3-prepare-research.py")
SPEC = importlib.util.spec_from_file_location("task9c5_3_prepare", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PreparationTests(unittest.TestCase):
    def test_only_authorized_research_sessions_are_configured(self):
        self.assertEqual(MODULE.SESSIONS, ("session-011", "session-012", "session-013"))
        self.assertNotIn("session-014", MODULE.TIMESTAMPS)

    def test_candidate_counts_are_in_target_range(self):
        for session in MODULE.SESSIONS:
            total = sum(len(values) for values in MODULE.TIMESTAMPS[session].values())
            self.assertGreaterEqual(total, 35)
            self.assertLessEqual(total, 45)

    def test_dhash_is_deterministic(self):
        image = np.zeros((20, 20, 3), dtype=np.uint8)
        self.assertEqual(MODULE.dhash(image), MODULE.dhash(image.copy()))


if __name__ == "__main__":
    unittest.main()
