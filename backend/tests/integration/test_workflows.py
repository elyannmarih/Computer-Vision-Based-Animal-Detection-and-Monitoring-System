"""FastAPI + PostgreSQL + disk + real YOLO; no mocked inference in these tests."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from datetime import datetime, timezone
from io import BytesIO
import unittest
from unittest.mock import patch
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from PIL import Image
import psycopg
from psycopg.rows import dict_row

from support import application_fixture, FIXTURE, MODEL, REVIEWER


class ApplicationWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stack = ExitStack()
        cls.addClassCleanup(cls.stack.close)
        app, cls.dsn, cls.uploads = cls.stack.enter_context(application_fixture())
        cls.client = cls.stack.enter_context(TestClient(app))

    def upload(self, data=None, **form):
        return self.client.post('/analyze', files={'image': ('fixture.png', data or FIXTURE.read_bytes(), 'image/png')}, data=form)

    def row(self, query, params=()):
        with psycopg.connect(self.dsn, row_factory=dict_row) as connection:
            return connection.execute(query, params).fetchone()

    def manual_image(self, count=2):
        """Known boxes isolate feedback logic from variable model predictions."""
        response = self.client.post('/images', json={
            'image_url': 'http://testserver/fixture', 'captured_at': '2026-01-01T00:00:00Z',
            'number_detections': count, 'number_targets_detected': count, 'targets_detected': count > 0,
        })
        self.assertEqual(response.status_code, 201, response.text)
        image_id = response.json()['image_id']
        boxes = []
        for index in range(count):
            response = self.client.post('/detections', json={
                'image_id': image_id, 'model_id': MODEL, 'class_label': 'dog', 'confidence': 0.8,
                'x_min': index * 0.3, 'y_min': 0.1, 'width': 0.2, 'height': 0.3,
            })
            self.assertEqual(response.status_code, 201, response.text)
            boxes.append(response.json()['detection_id'])
        return image_id, boxes

    def test_real_yolo_upload_persists_boxes_model_and_original_image(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201, response.text)
        result = response.json()
        self.assertEqual(result['model_version'], 'yolov8s-oiv7')
        self.assertIn('person', {box['class_label'] for box in result['detections']})
        image = result['image']
        self.assertEqual(image['number_detections'], len(result['detections']))
        self.assertEqual(self.client.get(image['image_url']).content, FIXTURE.read_bytes())
        saved = self.row('SELECT count(*) AS n FROM detections WHERE image_id=%s', [image['image_id']])
        self.assertEqual(saved['n'], len(result['detections']))
        for box in result['detections']:
            self.assertGreater(box['confidence'], 0)
            self.assertLessEqual(box['x_min'] + box['width'], 1.0001)
            self.assertLessEqual(box['y_min'] + box['height'], 1.0001)
            model = self.row('SELECT version_number FROM models WHERE model_id=%s', [box['model_id']])
            self.assertEqual(model['version_number'], 'yolov8s-oiv7')

    def test_real_yolo_blank_image_has_no_boxes_and_can_be_reviewed(self):
        buffer = BytesIO()
        Image.new('RGB', (640, 480), 'white').save(buffer, format='PNG')
        response = self.upload(buffer.getvalue())
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()['detections'], [])
        image_id = response.json()['image']['image_id']
        response = self.client.post(f'/images/{image_id}/verify', json={'verified_by_id': REVIEWER, 'target_found': False})
        self.assertEqual(response.status_code, 201, response.text)
        row = self.row('SELECT * FROM images WHERE image_id=%s', [image_id])
        self.assertTrue(row['human_verified'])
        self.assertEqual(row['number_targets_verified'], 0)

    def test_invalid_uploads_do_not_create_rows_or_files(self):
        before = self.row('SELECT count(*) AS n FROM images')['n']
        files = set(self.uploads.rglob('*'))
        for mime, data, status in [('text/plain', b'bad', 415), ('image/png', b'bad', 422),
                                   ('image/png', b'x' * (10 * 1024 * 1024 + 1), 413)]:
            response = self.client.post('/analyze', files={'image': ('bad.png', data, mime)})
            self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(self.row('SELECT count(*) AS n FROM images')['n'], before)
        self.assertEqual(set(self.uploads.rglob('*')), files)

    def test_invalid_camera_rolls_back_upload_and_removes_written_file(self):
        before = self.row('SELECT count(*) AS n FROM images')['n']
        files = {p for p in self.uploads.rglob('*') if p.is_file()}
        response = self.upload(camera_id=str(uuid4()))
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.row('SELECT count(*) AS n FROM images')['n'], before)
        self.assertEqual({p for p in self.uploads.rglob('*') if p.is_file()}, files)

    def test_feedback_revisions_persist_and_update_aggregate_counts(self):
        image_id, boxes = self.manual_image()
        for box, verdict, expected, complete in [(boxes[0], 'correct', 1, False),
                (boxes[1], 'incorrect', 1, True), (boxes[0], 'incorrect', 0, True)]:
            response = self.client.post(f'/detections/{box}/verify', json={
                'image_id': image_id, 'verified_by_id': REVIEWER, 'verdict': verdict})
            self.assertEqual(response.status_code, 201, response.text)
            row = self.row('SELECT * FROM images WHERE image_id=%s', [image_id])
            self.assertEqual(row['number_targets_verified'], expected)
            self.assertEqual(row['human_verified'], complete)
            detail = self.client.get(f'/detections/{box}').json()
            self.assertEqual(detail['verification_id'], response.json()['verification_id'])

    def test_missing_reviewer_rolls_back_feedback_transaction(self):
        image_id, boxes = self.manual_image(1)
        before = self.row('SELECT count(*) AS n FROM human_verifications')['n']
        response = self.client.post(f'/detections/{boxes[0]}/verify', json={
            'verified_by_id': str(uuid4()), 'verdict': 'correct'})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.row('SELECT count(*) AS n FROM human_verifications')['n'], before)
        self.assertFalse(self.client.get(f'/images/{image_id}').json()['human_verified'])

    def test_foreign_detection_subset_and_parent_are_rejected(self):
        first, boxes = self.manual_image(1)
        second, _ = self.manual_image(0)
        for ids in [boxes, [], [boxes[0], boxes[0]]]:
            response = self.client.post(f'/images/{second}/verify', json={
                'verified_by_id': REVIEWER, 'target_found': True, 'detection_ids': ids})
            self.assertEqual(response.status_code, 422)
        response = self.client.post(f'/detections/{boxes[0]}/verify', json={
            'image_id': second, 'verified_by_id': REVIEWER, 'verdict': 'correct'})
        self.assertEqual(response.status_code, 422)
        self.assertFalse(self.client.get(f'/images/{first}').json()['human_verified'])

    def test_concurrent_reviews_preserve_complete_image_totals(self):
        image_id, boxes = self.manual_image()
        def review(box):
            return self.client.post(f'/detections/{box}/verify', json={'verified_by_id': REVIEWER, 'verdict': 'correct'})
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(review, boxes))
        self.assertEqual([r.status_code for r in responses], [201, 201])
        row = self.row('SELECT * FROM images WHERE image_id=%s', [image_id])
        self.assertTrue(row['human_verified'])
        self.assertEqual(row['number_targets_verified'], 2)

    def test_crud_filters_patch_validation_and_delete(self):
        image_id, boxes = self.manual_image(1)
        response = self.client.get('/detections', params={'image_id': image_id, 'limit': 1, 'offset': 0})
        self.assertEqual([d['detection_id'] for d in response.json()], boxes)
        self.assertEqual(self.client.get('/detections?limit=0').status_code, 422)
        self.assertEqual(self.client.patch(f'/detections/{boxes[0]}', json={'confidence': 2}).status_code, 422)
        self.assertEqual(self.client.patch(f'/detections/{boxes[0]}', json={'confidence': 0.9}).json()['confidence'], 0.9)
        self.assertEqual(self.client.patch(f'/detections/{boxes[0]}', json={}).status_code, 200)
        self.assertEqual(self.client.delete(f'/images/{image_id}').status_code, 204)
        self.assertEqual(self.client.get(f'/detections/{boxes[0]}').status_code, 404)

    def test_camera_fixture_scan_uses_real_model_and_preserves_capture_time(self):
        import cv2
        from app import camera
        response = self.client.post('/cameras', json={'rtsp_stream_url': 'rtsp://fixture.example.invalid/live', 'location_name': 'Fixture camera'})
        camera_id = UUID(response.json()['camera_id'])
        live = camera.LiveCamera(camera_id, 'Fixture camera', 'fixture-only')
        frame_at = datetime.now(timezone.utc)
        live._frame = cv2.imread(str(FIXTURE))
        live._frame_at = frame_at
        with patch.dict(camera.cameras, {camera_id: live}):
            response = self.client.post(f'/live/{camera_id}/scan')
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(response.json()['image']['camera_id'], str(camera_id))
            self.assertIn('person', {d['class_label'] for d in response.json()['detections']})
            row = self.row('SELECT captured_at FROM images WHERE image_id=%s', [response.json()['image']['image_id']])
            self.assertEqual(row['captured_at'], frame_at)
            live._frame = None
            self.assertEqual(self.client.post(f'/live/{camera_id}/scan').status_code, 503)
        self.assertEqual(self.client.post(f'/live/{uuid4()}/scan').status_code, 404)
