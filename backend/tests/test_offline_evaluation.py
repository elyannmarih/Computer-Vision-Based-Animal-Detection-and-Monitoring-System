import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from evaluate import match, verified_classes


class OfflineEvaluationTests(unittest.TestCase):
    def test_duplicate_predictions_cannot_match_one_animal_twice(self):
        box = (0.1, 0.1, 0.2, 0.2)
        counts = match([("lizard", .9, box), ("lizard", .8, box)], [("lizard", box)])
        self.assertEqual(dict(counts["lizard"]), {"tp": 1, "fp": 1, "fn": 0})

    def test_wrong_species_is_false_positive_and_missed_target(self):
        box = (0.1, 0.1, 0.2, 0.2)
        counts = match([("dog", .9, box)], [("lizard", box)])
        self.assertEqual(counts["dog"]["fp"], 1)
        self.assertEqual(counts["lizard"]["fn"], 1)

    def test_nonoverlapping_prediction_does_not_match(self):
        counts = match([("lizard", .9, (0.7, 0.7, .1, .1))], [("lizard", (.1, .1, .1, .1))])
        self.assertEqual(dict(counts["lizard"]), {"tp": 0, "fp": 1, "fn": 1})

    def test_empty_scene_with_no_predictions_has_no_counts(self):
        self.assertEqual(match([], []), {})

    def test_partial_annotations_require_explicit_opt_in(self):
        record = {"source": "openimages", "truth": [("snake", (.1, .1, .2, .2))]}
        with self.assertRaises(ValueError):
            verified_classes(record, ["lizard", "snake"], allow_partial=False)
        self.assertEqual(verified_classes(record, ["lizard", "snake"], allow_partial=True), {"snake"})

    def test_complete_negative_scores_every_supported_class(self):
        record = {"truth": [], "complete_annotations": True, "verified_empty": True}
        self.assertEqual(verified_classes(record, ["lizard", "snake"], allow_partial=False), {"lizard", "snake"})
