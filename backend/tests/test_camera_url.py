"""Camera URL handling without opening a stream or contacting a database."""
import os
import unittest
from unittest.mock import patch
from uuid import uuid4

os.environ["DATABASE_URL"] = "postgresql://unused:unused@127.0.0.1:1/unused"
with patch("dotenv.load_dotenv", return_value=False):
    from app.camera import LiveCamera, without_credentials


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
