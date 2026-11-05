"""The distributed application must use real weights and fail explicitly otherwise."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import detector


class ModelConfigurationTests(unittest.TestCase):
    def test_bundled_default_is_the_only_distributed_model(self):
        with patch.dict(os.environ, {"LIZARD_MODEL": ""}), patch.object(detector, "SELECTED_FILE", Path('nonexistent-local-selection.txt')):
            self.assertEqual(detector._startup_model().version, "yolov8s-oiv7")
        self.assertEqual([m.version for m in detector.available_models()], ["yolov8s-oiv7"])

    def test_missing_configuration_never_generates_fake_detections(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"LIZARD_MODEL": ""}), patch.object(detector, "MODELS_DIR", Path(directory)), patch.object(detector, "SELECTED_FILE", Path(directory)/'selected.txt'):
                with self.assertRaises(ValueError):
                    detector._startup_model()
        with self.assertRaises(ValueError):
            detector.detect(b'not-an-image', detector.Model('missing-weights'))

    def test_removed_local_model_falls_back_to_bundled_default(self):
        with tempfile.TemporaryDirectory() as directory:
            selected = Path(directory)/'selected.txt'
            selected.write_text('removed-model')
            with patch.dict(os.environ, {"LIZARD_MODEL": ""}), patch.object(detector, "SELECTED_FILE", selected):
                self.assertEqual(detector._startup_model().version, 'yolov8s-oiv7')
