import os
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch
from uuid import uuid4
from psycopg.errors import SerializationFailure
from psycopg import OperationalError
from starlette.requests import Request
from starlette.datastructures import UploadFile, Headers

os.environ["DATABASE_URL"] = "postgresql://unused:unused@127.0.0.1:1/unused"
with patch("dotenv.load_dotenv", return_value=False):
    from app import analysis


class AnalysisTransactionTests(unittest.TestCase):
    def setUp(self):
        self.conn = MagicMock()
        self.conn.execute.return_value.fetchone.return_value = {"model_id": uuid4(), "image_id": uuid4()}
        self.request = Request({"type": "http", "scheme": "http", "server": ("localhost", 8000), "path": "/analyze", "root_path": "", "headers": []})
        fixture = Path(__file__).resolve().parents[2] / "frontend/tests/fixtures/image.png"
        self.image = UploadFile(file=BytesIO(fixture.read_bytes()), filename="fixture.png", headers=Headers({"content-type": "image/png"}))
        self.addCleanup(self.image.file.close)
        self.save = self.enterContext(patch.object(analysis.storage, "save", return_value=("fixture-key", "http://localhost/uploads/fixture")))
        self.delete = self.enterContext(patch.object(analysis.storage, "delete"))
        self.enterContext(patch.object(analysis.detector, "detect", return_value=[]))
    def run_analysis(self):
        return analysis.analyze(self.request, self.conn, self.image, camera_id=None, captured_at=None)
    def test_commit_completes_before_success_is_returned(self):
        self.run_analysis()
        self.conn.commit.assert_called_once()
        self.delete.assert_not_called()
    def test_commit_failure_rolls_back_and_removes_image(self):
        self.conn.commit.side_effect = SerializationFailure("commit failed")
        with self.assertRaisesRegex(SerializationFailure, "commit failed"):
            self.run_analysis()
        self.conn.rollback.assert_called_once()
        self.delete.assert_called_once_with("fixture-key")
    def test_cleanup_failure_preserves_original_commit_error(self):
        self.conn.commit.side_effect = SerializationFailure("commit failed")
        self.delete.side_effect = ValueError("delete failed")
        with self.assertRaisesRegex(SerializationFailure, "commit failed"):
            self.run_analysis()
    def test_query_failure_rolls_back_and_cleans_up(self):
        self.conn.execute.side_effect = RuntimeError("query failed")
        with self.assertRaisesRegex(RuntimeError, "query failed"):
            self.run_analysis()
        self.conn.rollback.assert_called_once()
        self.delete.assert_called_once_with("fixture-key")

    def test_uncertain_commit_keeps_image_in_case_the_database_committed(self):
        self.conn.commit.side_effect = OperationalError("commit acknowledgement lost")
        with self.assertRaises(OperationalError):
            self.run_analysis()
        self.delete.assert_not_called()
