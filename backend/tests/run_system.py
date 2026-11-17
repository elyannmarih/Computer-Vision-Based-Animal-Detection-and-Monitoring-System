"""Run browser workflows through real Next.js, FastAPI, PostgreSQL and YOLO.

Run from the repository root after building the frontend. The test role must
have CREATEDB permission on an explicitly configured local detectra_test DB.
"""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import threading
import time

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(Path(__file__).parent / 'integration'))

import psycopg  # noqa: E402
import uvicorn  # noqa: E402
from PIL import Image  # noqa: E402
from support import application_fixture, FIXTURE  # noqa: E402


def main():
    frontend = BACKEND.parent / 'frontend'
    node = shutil.which('node')
    if not node or not (frontend / '.next/BUILD_ID').is_file():
        raise RuntimeError('Install Node.js and run npm --prefix frontend run build first.')
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 8102))  # Refuse to reuse another application's server.
        with application_fixture('http://127.0.0.1:8102') as (app, dsn, uploads):
            import cv2
            from app import camera
            video = uploads.parent / 'camera-fixture.avi'
            blank = uploads.parent / 'blank.png'
            Image.new('RGB', (640, 480), 'white').save(blank)
            writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*'MJPG'), 1, (512, 512))
            try:
                if not writer.isOpened():
                    raise RuntimeError('Could not create the local camera video fixture.')
                frame = cv2.imread(str(FIXTURE))
                for _ in range(180):
                    writer.write(frame)
            finally:
                writer.release()
            with psycopg.connect(dsn) as connection:
                camera_id = connection.execute(
                    'INSERT INTO cameras (rtsp_stream_url, location_name) VALUES (%s,%s) RETURNING camera_id',
                    ['fixture://local-video', 'Local video fixture'],
                ).fetchone()[0]
            live = camera.LiveCamera(camera_id, 'Local video fixture', str(video))
            camera.cameras[camera_id] = live
            server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=8102, log_level='warning', timeout_graceful_shutdown=5))
            thread = threading.Thread(target=server.run, kwargs={'sockets': [listener]}, daemon=True)
            live.start()
            try:
                thread.start()
                deadline = time.monotonic() + 90
                while not server.started or live.jpeg is None:
                    if not thread.is_alive() or time.monotonic() > deadline:
                        raise RuntimeError('The isolated API or local video fixture did not start.')
                    time.sleep(0.1)
                return subprocess.run([
                    node, str(frontend / 'node_modules/@playwright/test/cli.js'),
                    'test', '--config=playwright.system.config.ts',
                ], cwd=frontend, env={**os.environ, 'DETECTRA_SYSTEM_TEST': '1', 'DETECTRA_BLANK_FIXTURE': str(blank)}, check=False).returncode
            finally:
                server.should_exit = True
                thread.join(timeout=25)
                live.stop()
                if thread.is_alive():
                    raise RuntimeError('Test server did not stop; inspect its connections before cleanup.')


if __name__ == '__main__':
    raise SystemExit(main())
