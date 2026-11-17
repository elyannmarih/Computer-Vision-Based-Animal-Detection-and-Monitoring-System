"""Application resources are closed even when startup or request handling fails."""
import os
import unittest
from unittest.mock import patch

os.environ['DATABASE_URL'] = 'postgresql://unused:unused@127.0.0.1:1/unused'
with patch('dotenv.load_dotenv', return_value=False):
    from app import main


class LifespanTests(unittest.IsolatedAsyncioTestCase):
    async def test_startup_failure_closes_pool_and_stops_partial_camera_start(self):
        with patch.object(main, 'pool') as pool, patch.object(main, 'camera') as camera:
            camera.start.side_effect = RuntimeError('camera startup failed')
            with self.assertRaisesRegex(RuntimeError, 'camera startup failed'):
                async with main.lifespan(main.app):
                    self.fail('Startup should not complete')
            camera.stop.assert_called_once()
            pool.close.assert_called_once()

    async def test_request_failure_still_closes_resources(self):
        with patch.object(main, 'pool') as pool, patch.object(main, 'camera') as camera:
            with self.assertRaisesRegex(RuntimeError, 'request failed'):
                async with main.lifespan(main.app):
                    raise RuntimeError('request failed')
            camera.stop.assert_called_once()
            pool.close.assert_called_once()

    async def test_pool_closes_when_camera_stop_fails(self):
        with patch.object(main, 'pool') as pool, patch.object(main, 'camera') as camera:
            camera.stop.side_effect = RuntimeError('camera shutdown failed')
            with self.assertRaisesRegex(RuntimeError, 'camera shutdown failed'):
                async with main.lifespan(main.app):
                    pass
            pool.close.assert_called_once()
