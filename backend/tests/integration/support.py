"""A real application backed only by a new, local, disposable PostgreSQL database."""
from contextlib import contextmanager, ExitStack
import os
from pathlib import Path
import re
import tempfile
from unittest.mock import patch
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from starlette.staticfiles import StaticFiles

from development_db import connection_settings, initialize
from seed import seed

FIXTURE = Path(__file__).resolve().parents[1] / 'fixtures/astronaut.png'
REVIEWER = '30000000-0000-0000-0000-000000000001'
MODEL = '20000000-0000-0000-0000-000000000001'


@contextmanager
def application_fixture(base_url='http://testserver'):
    settings = connection_settings(os.environ.get('DETECTRA_TEST_DATABASE_URL'))
    if not settings['dbname'].startswith('detectra_test'):
        raise RuntimeError('System tests require an explicit local detectra_test database and CREATEDB role.')
    settings.update(hostaddr='::1' if settings['host'] == '::1' else '127.0.0.1', connect_timeout='5')
    name = 'detectra_test_' + uuid4().hex
    admin_dsn = make_conninfo(**settings)
    with psycopg.connect(admin_dsn, autocommit=True) as admin:
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    try:
        dsn = make_conninfo(**{**settings, 'dbname': name})
        with tempfile.TemporaryDirectory(prefix='detectra-system-') as directory, ExitStack() as stack:
            root = Path(directory)
            uploads = root / 'uploads'
            uploads.mkdir()
            with psycopg.connect(dsn, row_factory=dict_row) as connection:
                initialize(connection)
                seed(connection, uploads, base_url)
            # Never load developer credentials, contact S3, open a real camera, or save preferences.
            stack.enter_context(patch('dotenv.load_dotenv', return_value=False))
            stack.enter_context(patch.dict(os.environ, {
                'DATABASE_URL': dsn, 'CAMERA_RTSP_URL': '', 'S3_BUCKET': '',
                'CAMERA_SAVE_INTERVAL': '0', 'LIZARD_MODEL': 'yolov8s-oiv7',
            }))
            from app import storage, detector, db
            stack.enter_context(patch.object(storage, 'UPLOAD_DIR', uploads))
            stack.enter_context(patch.object(storage, 'S3_BUCKET', ''))
            stack.enter_context(patch.object(detector, 'CLASSES_FILE', root / 'classes.json'))
            stack.enter_context(patch.object(detector, 'SELECTED_FILE', root / 'selected.txt'))
            stack.enter_context(patch.object(detector, '_selected_classes', {}))
            stack.enter_context(patch.object(detector, '_active', detector.load_model('yolov8s-oiv7')))
            from app import main, camera
            pool = ConnectionPool(dsn, kwargs={'row_factory': dict_row}, open=False)
            stack.callback(pool.close)
            for module in (db, main, camera):
                stack.enter_context(patch.object(module, 'pool', pool))
            stack.enter_context(patch.object(camera, 'SAVE_INTERVAL', 0))
            stack.enter_context(patch.object(camera, 'cameras', {}))
            for route in main.app.routes:
                if getattr(route, 'path', None) == '/uploads':
                    stack.enter_context(patch.object(route, 'app', StaticFiles(directory=uploads)))
            yield main.app, dsn, uploads
    finally:
        # No reset, force-drop, or deletion of the caller's configured database.
        if not re.fullmatch(r'detectra_test_[0-9a-f]{32}', name):
            raise RuntimeError('Unexpected database name; cleanup refused.')
        with psycopg.connect(admin_dsn, autocommit=True) as admin:
            admin.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(name)))
