import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app import detector


class SpeciesSelectionTests(unittest.TestCase):
    def setUp(self):
        self.model = detector.Model("test", info={"class_map": {
            "Dog": "dog", "Lizard": "lizard", "Man": "person", "Woman": "person",
        }}, weights=Path("test.pt"))
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.path = Path(directory) / "selected-classes.json"
        self.enterContext(patch.object(detector, "CLASSES_FILE", self.path))
        self.enterContext(patch.object(detector, "_selected_classes", {}))
        self.enterContext(patch.object(detector, "_active", self.model))

    def test_selection_persists_and_rejects_invalid_updates(self):
        detector.select_classes("test", ["dog", "lizard"])
        self.assertEqual(detector.selected_classes(self.model), ["dog", "lizard"])
        before = self.path.read_text()
        for version, classes in [("other", ["dog"]), ("test", []), ("test", ["cat"]), ("test", ["dog", "dog"])]:
            with self.assertRaises(ValueError):
                detector.select_classes(version, classes)
        self.assertEqual(self.path.read_text(), before)

    def test_yolo_receives_only_selected_class_ids_including_aliases(self):
        detector.select_classes("test", ["person", "lizard"])
        yolo = MagicMock()
        yolo.names = {0: "Dog", 1: "Lizard", 2: "Man", 3: "Woman", 4: "Car"}
        result = yolo.predict.return_value[0]
        result.boxes.xyxyn.tolist.return_value = []
        with patch.object(detector, "_yolo", return_value=yolo):
            self.assertEqual(detector._predict(object(), self.model), [])
        self.assertEqual(yolo.predict.call_args.kwargs["classes"], [1, 2, 3])

    def test_default_includes_all_supported_classes(self):
        self.assertEqual(detector.selected_classes(self.model), ["dog", "lizard", "person"])
