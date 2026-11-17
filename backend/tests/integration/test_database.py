"""PostgreSQL setup/seed tests in a new disposable database owned by this test run.

Requires DETECTRA_TEST_DATABASE_URL pointing to a local detectra_test database
whose role has CREATEDB permission. A missing/unsafe target is a test error.
"""
from decimal import Decimal
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import UUID, uuid4

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from development_db import DevelopmentDatabaseError, connection_settings, initialize
from seed import SAMPLE_PATH, image_key, seed
from app import schemas


class PostgreSQLSetupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = connection_settings(os.environ.get('DETECTRA_TEST_DATABASE_URL'))
        if not settings['dbname'].startswith('detectra_test'):
            raise RuntimeError('Integration tests require a detectra_test database.')
        cls.admin_settings = {**settings, 'hostaddr': '::1' if settings['host'] == '::1' else '127.0.0.1', 'connect_timeout': 5}
        cls.database_name = 'detectra_test_'+uuid4().hex
        with psycopg.connect(**cls.admin_settings, autocommit=True) as admin:
            admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(cls.database_name)))
        cls.settings = {**cls.admin_settings, 'dbname': cls.database_name}

    @classmethod
    def tearDownClass(cls):
        # Only the exact random database created by this class can be removed.
        if not cls.database_name.startswith('detectra_test_') or len(cls.database_name) != 46:
            raise RuntimeError('Unexpected disposable database name; cleanup refused.')
        with psycopg.connect(**cls.admin_settings, autocommit=True) as admin:
            admin.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(cls.database_name)))

    def setUp(self):
        self.connection = psycopg.connect(**self.settings, row_factory=dict_row)
        self.addCleanup(self.connection.close)
        self.addCleanup(self.connection.rollback)
        self.directory = self.enterContext(tempfile.TemporaryDirectory())
        self.uploads = Path(self.directory)

    def prepare(self):
        initialize(self.connection)
        return seed(self.connection, self.uploads, 'http://127.0.0.1:8000')

    def test_empty_database_initializes_and_repeat_is_a_no_op(self):
        self.assertTrue(initialize(self.connection))
        self.assertFalse(initialize(self.connection))
        tables = self.connection.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'").fetchall()
        self.assertEqual(len(tables), 6)

    def test_existing_unrelated_database_is_left_unchanged(self):
        self.connection.execute('CREATE TABLE existing_work (value text)')
        self.connection.execute("INSERT INTO existing_work VALUES ('keep this')")
        with self.assertRaises(DevelopmentDatabaseError):
            initialize(self.connection)
        self.assertEqual(self.connection.execute('SELECT value FROM existing_work').fetchone()['value'], 'keep this')
        self.assertIsNone(self.connection.execute("SELECT to_regclass('public.cameras') AS name").fetchone()['name'])

    def test_seed_is_repeatable_and_does_not_overwrite_reviewed_records(self):
        inserted = self.prepare()
        self.assertEqual(inserted, {'cameras': 1, 'models': 1, 'trusted_persons': 1, 'human_verifications': 3, 'images': 3, 'detections': 3})
        self.connection.execute("UPDATE trusted_persons SET first_name='Edited locally'")
        self.assertTrue(all(count == 0 for count in seed(self.connection, self.uploads, 'http://127.0.0.1:8000').values()))
        self.assertEqual(self.connection.execute('SELECT first_name FROM trusted_persons').fetchone()['first_name'], 'Edited locally')
        self.assertEqual(len(list(self.uploads.rglob('*.png'))), 3)

    def test_seed_requires_initialized_schema(self):
        with self.assertRaises(DevelopmentDatabaseError):
            seed(self.connection, self.uploads, 'http://127.0.0.1:8000')
        self.assertFalse(list(self.uploads.rglob('*')))

    def test_sample_data_matches_response_schemas_and_verification_counts(self):
        self.prepare()
        models = {'cameras': schemas.CameraRead, 'models': schemas.ModelRead,
                  'trusted_persons': schemas.TrustedPersonRead, 'human_verifications': schemas.HumanVerificationRead,
                  'images': schemas.ImageRead, 'detections': schemas.DetectionRead}
        for table, schema in models.items():
            for row in self.connection.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(table))).fetchall():
                schema(**row)
        rows = self.connection.execute('''SELECT i.number_detections, i.number_targets_verified,
            count(d.detection_id) AS actual_detections,
            count(d.detection_id) FILTER (WHERE v.target_found) AS confirmed
            FROM images i LEFT JOIN detections d USING (image_id)
            LEFT JOIN human_verifications v ON v.verification_id=d.verification_id
            GROUP BY i.image_id''').fetchall()
        self.assertTrue(all(row['number_detections'] == row['actual_detections'] and row['number_targets_verified'] == row['confirmed'] for row in rows))
        self.assertFalse(self.connection.execute('SELECT enabled FROM cameras').fetchone()['enabled'])

    def test_invalid_confidence_and_missing_parent_are_rejected(self):
        self.prepare()
        with self.assertRaises(psycopg.errors.CheckViolation), self.connection.transaction():
            self.connection.execute('UPDATE detections SET confidence=1.2')
        with self.assertRaises(psycopg.errors.ForeignKeyViolation), self.connection.transaction():
            self.connection.execute('UPDATE detections SET image_id=%s', [uuid4()])

    def test_image_deletion_cascades_only_to_its_detections(self):
        self.prepare()
        self.connection.execute("DELETE FROM images WHERE image_id='50000000-0000-0000-0000-000000000001'")
        self.assertEqual(self.connection.execute('SELECT count(*) AS n FROM detections').fetchone()['n'], 1)
        self.assertEqual(self.connection.execute('SELECT count(*) AS n FROM human_verifications').fetchone()['n'], 3)

    def test_camera_deletion_keeps_images_and_clears_reference(self):
        self.prepare()
        self.connection.execute('DELETE FROM cameras')
        self.assertEqual(self.connection.execute('SELECT count(*) AS n FROM images').fetchone()['n'], 3)
        self.assertFalse(self.connection.execute('SELECT 1 FROM images WHERE camera_id IS NOT NULL').fetchone())

    def test_existing_image_content_is_never_overwritten(self):
        initialize(self.connection)
        first = json.loads(SAMPLE_PATH.read_text())['images'][0]['image_id']
        path = self.uploads/image_key(first)
        path.parent.mkdir(parents=True)
        path.write_bytes(b'keep existing file')
        with self.assertRaises(DevelopmentDatabaseError):
            seed(self.connection, self.uploads, 'http://127.0.0.1:8000')
        self.assertEqual(path.read_bytes(), b'keep existing file')
        self.assertEqual(self.connection.execute('SELECT count(*) AS n FROM images').fetchone()['n'], 0)

    def test_schema_preserves_existing_numeric_precision_and_optional_fields(self):
        self.prepare()
        row = self.connection.execute('SELECT confidence, width FROM detections ORDER BY detection_id LIMIT 1').fetchone()
        self.assertEqual(row['confidence'], Decimal('.8800'))
        self.assertEqual(row['width'], Decimal('.30000'))
        self.assertIsNone(self.connection.execute('SELECT precision_rating FROM models').fetchone()['precision_rating'])
        self.assertIsInstance(self.connection.execute('SELECT camera_id FROM cameras').fetchone()['camera_id'], UUID)

    def test_required_lookup_indexes_are_created(self):
        initialize(self.connection)
        names = {row['indexname'] for row in self.connection.execute("SELECT indexname FROM pg_indexes WHERE schemaname='public'")}
        self.assertTrue({'images_camera_recent_idx', 'detections_image_idx', 'models_version_lookup_idx', 'human_verifications_reviewer_idx'}.issubset(names))

    def test_seeded_records_can_be_read_through_fastapi(self):
        self.prepare()
        # Override the DB dependency; do not run the app lifespan or start a camera.
        with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://unused:unused@127.0.0.1:1/unused'}), patch('dotenv.load_dotenv', return_value=False):
            from app.main import app
            from app.db import get_conn
        from fastapi.testclient import TestClient
        with patch.dict(app.dependency_overrides, {get_conn: lambda: self.connection}):
            client = TestClient(app)
            try:
                for route in ['/health', '/cameras', '/models', '/trusted-persons',
                              '/human-verifications', '/images', '/detections']:
                    with self.subTest(route=route):
                        self.assertEqual(client.get(route).status_code, 200)
                image = client.get('/images/50000000-0000-0000-0000-000000000001').json()
                self.assertTrue(image['human_verified'])
                self.assertEqual(image['number_targets_verified'], 1)
                self.assertEqual(client.get('/models/20000000-0000-0000-0000-000000000001').json()['version_number'], 'stub-demo-v1')
            finally:
                client.close()
