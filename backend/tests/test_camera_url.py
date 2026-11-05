"""Camera URL handling without opening a stream or contacting a database."""
import os
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

os.environ["DATABASE_URL"] = "postgresql://unused:unused@127.0.0.1:1/unused"
with patch("dotenv.load_dotenv", return_value=False):
    from app.camera import LiveCamera, without_credentials
    from app import camera as camera_module


class CameraUrlTests(unittest.TestCase):
    def test_credentials_are_removed_and_never_appear_in_status(self):
        url = "rtsp://user:s3cret@192.168.1.50:554/stream1"
        self.assertEqual(without_credentials(url), "rtsp://192.168.1.50:554/stream1")
        camera = LiveCamera(uuid4(), "Yard", url)
        status = str(camera.status())
        self.assertNotIn("s3cret", status)
        self.assertNotIn("rtsp://", status)
        self.assertNotIn(url, status)

    def test_file_path_and_url_without_credentials_stay_stable(self):
        self.assertEqual(without_credentials("rtsp://192.168.1.50/live"), "rtsp://192.168.1.50/live")
        self.assertEqual(without_credentials("videos/lizard.mp4"), "videos/lizard.mp4")

    def test_query_tokens_and_fragments_are_not_published(self):
        self.assertEqual(without_credentials("rtsp://user:secret@camera.example/live?token=private#password"),
                         "rtsp://camera.example/live")

    def test_ipv6_address_stays_valid_after_credentials_are_removed(self):
        self.assertEqual(without_credentials("rtsp://user:secret@[::1]:554/live?password=secret"),
                         "rtsp://[::1]:554/live")

    def test_failed_capture_is_released_and_retried(self):
        camera = LiveCamera(uuid4(), 'Fixture', 'rtsp://user:secret@camera.example/live')
        failed = MagicMock()
        failed.isOpened.return_value = False
        recovered = MagicMock()
        recovered.isOpened.return_value = True
        def end_read():
            camera._stop.set()
            return False, None
        recovered.read.side_effect = end_read
        with patch.object(camera_module.cv2, 'VideoCapture', side_effect=[failed, recovered]) as capture, \
                patch.object(camera_module, 'RECONNECT_DELAY', 0):
            camera._read()
        self.assertEqual(capture.call_count, 2)
        failed.release.assert_called_once()
        recovered.release.assert_called_once()
        self.assertNotIn('secret', str(camera.status()))

    def test_capture_exception_does_not_kill_reconnection_or_expose_url(self):
        camera = LiveCamera(uuid4(), 'Fixture', 'rtsp://user:secret@camera.example/live')
        failed = MagicMock()
        failed.read.side_effect = camera_module.cv2.error('failure at rtsp://user:secret@camera.example/live')
        recovered = MagicMock()
        def stop_after_retry():
            self.assertNotIn('secret', str(camera.status()))
            camera._stop.set()
            return recovered
        with patch.object(camera_module.cv2, 'VideoCapture') as capture:
            # The second attempt must run after the exception, without sleeping in the test.
            def open_capture(*args):
                return failed if capture.call_count == 1 else stop_after_retry()
            capture.side_effect = open_capture
            with patch.object(camera_module, 'RECONNECT_DELAY', 0):
                camera._read()
        self.assertEqual(capture.call_count, 2)
        failed.release.assert_called_once()
        recovered.release.assert_called_once()
