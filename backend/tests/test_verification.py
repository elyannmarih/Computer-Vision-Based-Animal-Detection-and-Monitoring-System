"""Run real verification functions/aggregate SQL against an isolated in-memory SQL database.

SQLite is only a unit-test harness, not a production schema or a PostgreSQL concurrency test.
No shared database, seed script, or real image storage is used.
"""
import os
import re
import sqlite3
import unittest
from uuid import UUID, uuid4
from unittest.mock import patch

os.environ["DATABASE_URL"] = "postgresql://unused:unused@127.0.0.1:1/unused"
with patch("dotenv.load_dotenv", return_value=False):
    from app.main import verify_image
    from app.analysis import verify_detection
    from app.schemas import ImageVerification, DetectionVerification
from fastapi import HTTPException


class Cursor:
    def __init__(self, cursor):
        self.cursor = cursor
    def fetchone(self):
        row = self.cursor.fetchone()
        return dict(row) if row is not None else None
    def fetchall(self):
        return [dict(row) for row in self.cursor.fetchall()]


class MemoryConnection:
    def __init__(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE images (image_id TEXT PRIMARY KEY, human_verified BOOLEAN DEFAULT false,
                verification_id TEXT, number_targets_verified INTEGER DEFAULT 0);
            CREATE TABLE detections (detection_id TEXT PRIMARY KEY, image_id TEXT, class_label TEXT,
                human_verified BOOLEAN DEFAULT false, verification_id TEXT);
            CREATE TABLE human_verifications (verification_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                verified_by_id TEXT, target_found BOOLEAN);
        """)
    def execute(self, query, args=()):
        # Adapt parameter syntax and row locking only; execute the actual aggregate SQL.
        query = query.replace(" FOR UPDATE", "").replace("UPDATE images i SET", "UPDATE images AS i SET")
        if isinstance(args, dict):
            query = re.sub(r"%\((\w+)\)s", r":\1", query)
            args = {k: str(v) if isinstance(v, UUID) else v for k, v in args.items()}
        else:
            values = []
            for arg in args:
                if isinstance(arg, list):
                    query = query.replace("= ANY(%s)", "IN (" + ",".join("%s" for _ in arg) + ")", 1)
                    values.extend(str(v) if isinstance(v, UUID) else v for v in arg)
                else:
                    values.append(str(arg) if isinstance(arg, UUID) else arg)
            query = query.replace("%s", "?")
            args = values
        return Cursor(self.db.execute(query, args))


class VerificationTests(unittest.TestCase):
    def setUp(self):
        self.conn = MemoryConnection()
        self.addCleanup(self.conn.db.close)
        self.image_id, self.reviewer_id = uuid4(), uuid4()
        self.conn.execute("INSERT INTO images (image_id) VALUES (%s)", [self.image_id])
    def add_detection(self, label="lizard"):
        identifier = uuid4()
        self.conn.execute("INSERT INTO detections (detection_id, image_id, class_label) VALUES (%s,%s,%s)", [identifier, self.image_id, label])
        return identifier
    def image(self):
        return self.conn.execute("SELECT * FROM images WHERE image_id=%s", [self.image_id]).fetchone()
    def review_image(self, **kwargs):
        return verify_image(self.image_id, ImageVerification(verified_by_id=self.reviewer_id, target_found=True, **kwargs), self.conn)
    def test_empty_subset_is_rejected_before_inserting_feedback(self):
        self.add_detection()
        with self.assertRaises(HTTPException) as error:
            self.review_image(detection_ids=[])
        self.assertEqual(error.exception.status_code, 422)
        self.assertFalse(self.image()["human_verified"])
        self.assertEqual(self.conn.execute("SELECT count(*) AS n FROM human_verifications").fetchone()["n"], 0)
    def test_foreign_subset_is_rejected(self):
        self.add_detection()
        with self.assertRaises(HTTPException) as error:
            self.review_image(detection_ids=[uuid4()])
        self.assertEqual(error.exception.status_code, 422)
        self.assertFalse(self.image()["human_verified"])
    def test_duplicate_subset_is_rejected(self):
        detection = self.add_detection()
        with self.assertRaises(HTTPException):
            self.review_image(detection_ids=[detection, detection])
    def test_partial_review_leaves_image_unverified_and_updates_count(self):
        first = self.add_detection(); self.add_detection()
        self.review_image(detection_ids=[first])
        self.assertFalse(self.image()["human_verified"])
        self.assertEqual(self.image()["number_targets_verified"], 1)
    def test_whole_image_review_counts_only_lizard_detections(self):
        self.add_detection(); self.add_detection(); self.add_detection("bird")
        self.review_image()
        self.assertTrue(self.image()["human_verified"])
        self.assertEqual(self.image()["number_targets_verified"], 2)
    def test_no_detection_feedback_verifies_image_without_inventing_a_box_count(self):
        verify_image(self.image_id, ImageVerification(verified_by_id=self.reviewer_id, target_found=False), self.conn)
        self.assertTrue(self.image()["human_verified"])
        self.assertEqual(self.image()["number_targets_verified"], 0)
    def test_individual_reviews_become_complete_only_after_all_are_reviewed(self):
        first, second = self.add_detection(), self.add_detection()
        body = DetectionVerification(verified_by_id=self.reviewer_id, verdict="correct")
        verify_detection(first, body, self.conn)
        self.assertFalse(self.image()["human_verified"])
        verify_detection(second, body, self.conn)
        self.assertTrue(self.image()["human_verified"])
        self.assertEqual(self.image()["number_targets_verified"], 2)
    def test_individual_aggregation_excludes_non_targets(self):
        first, bird = self.add_detection(), self.add_detection("bird")
        self.review_image(detection_ids=[bird])
        verify_detection(first, DetectionVerification(verified_by_id=self.reviewer_id, verdict="correct"), self.conn)
        self.assertEqual(self.image()["number_targets_verified"], 1)
    def test_individual_feedback_rejects_mismatched_image(self):
        detection = self.add_detection()
        body = DetectionVerification(verified_by_id=self.reviewer_id, verdict="correct", image_id=uuid4())
        with self.assertRaises(HTTPException) as error:
            verify_detection(detection, body, self.conn)
        self.assertEqual(error.exception.status_code, 422)
        self.assertFalse(self.image()["human_verified"])
