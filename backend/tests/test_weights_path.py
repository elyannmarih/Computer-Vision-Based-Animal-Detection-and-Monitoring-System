"""Weights paths that contain an apostrophe, without loading a network."""
import os
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ["DATABASE_URL"] = "postgresql://unused:unused@127.0.0.1:1/unused"
with patch("dotenv.load_dotenv", return_value=False):
    from app.detector import weights_path


class WeightsPathTests(unittest.TestCase):
    def test_apostrophe_in_the_project_path_is_not_passed_to_ultralytics(self):
        source = Path(__file__).resolve().parents[1] / "models" / "yolo11n-20261024-110930" / "model.pt"
        self.assertTrue(source.is_file())
        opened = weights_path(source)
        self.assertNotIn("'", opened)
        self.assertTrue(Path(opened).is_file())
        self.assertEqual(Path(opened).stat().st_size, source.stat().st_size)
