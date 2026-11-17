"""Load fictional demo records into an initialized local development database.

Existing rows and image files are never overwritten. No API, camera, YOLO model,
Neon configuration, or S3 client is loaded by this script.
"""
import argparse
from io import BytesIO
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit
from uuid import UUID

from PIL import Image, ImageDraw
from psycopg import sql

from development_db import DevelopmentDatabaseError, connect_development, require_initialized

SAMPLE_PATH = Path(__file__).parent / 'database/sample_data.json'
PRIMARY_KEYS = {
    'cameras': 'camera_id', 'models': 'model_id', 'trusted_persons': 'trusted_person_id',
    'human_verifications': 'verification_id', 'images': 'image_id', 'detections': 'detection_id',
}


def image_key(image_id: str) -> str:
    return f'images/2026/01/01/{UUID(image_id).hex}.png'


def render_sample(image_id: str, detections: list[dict]) -> bytes:
    image = Image.new('RGB', (640, 360), '#f3f4ee')
    draw = ImageDraw.Draw(image)
    draw.text((20, 20), 'SYNTHETIC DEMO - MANUALLY CREATED EXAMPLES', fill='#202020')
    draw.text((20, 40), 'Illustrations, labels and scores are not real model predictions.', fill='#202020')
    found = [row for row in detections if row['image_id'] == image_id]
    for row in found:
        x, y = row['x_min']*640, row['y_min']*360
        w, h = row['width']*640, row['height']*360
        draw.rectangle((x, y, x+w, y+h), fill='#a7c5a0' if row['class_label'] == 'dog' else '#e7ba78')
        draw.text((x+8, y+8), row['class_label']+' example', fill='#202020')
    if not found:
        draw.text((180, 170), 'Empty scene example - no annotated objects', fill='#202020')
    data = BytesIO()
    image.save(data, format='PNG')
    return data.getvalue()


def seed(connection, uploads: Path, api_base_url: str) -> dict[str, int]:
    require_initialized(connection)
    parts = urlsplit(api_base_url)
    if (parts.scheme not in {'http', 'https'} or not parts.hostname or parts.username or parts.password
            or parts.query or parts.fragment or parts.path not in {'', '/'}):
        raise DevelopmentDatabaseError('Use an HTTP(S) API origin without credentials, paths or query parameters.')
    data = json.loads(SAMPLE_PATH.read_text(encoding='utf-8'))
    root = uploads.resolve()
    files = []
    for row in data['images']:
        key = image_key(row['image_id'])
        row['image_url'] = api_base_url.rstrip('/') + '/uploads/' + key
        path = (root / key).resolve()
        if not path.is_relative_to(root):
            raise DevelopmentDatabaseError('The sample image path must stay inside the upload directory.')
        payload = render_sample(row['image_id'], data['detections'])
        if path.exists() and path.read_bytes() != payload:
            raise DevelopmentDatabaseError('A sample image path already contains different data; no files were overwritten.')
        files.append((path, payload))
    for path, payload in files:
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open('xb') as stream:
                stream.write(payload)
    inserted = {}
    for table, primary_key in PRIMARY_KEYS.items():
        inserted[table] = 0
        for row in data[table]:
            query = sql.SQL('INSERT INTO {} ({}) VALUES ({}) ON CONFLICT ({}) DO NOTHING').format(
                sql.Identifier(table), sql.SQL(', ').join(map(sql.Identifier, row)),
                sql.SQL(', ').join(sql.Placeholder() for _ in row), sql.Identifier(primary_key))
            inserted[table] += connection.execute(query, list(row.values())).rowcount
    return inserted


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uploads-dir', type=Path, default=Path(__file__).parent / 'uploads')
    parser.add_argument('--api-base-url', default='http://127.0.0.1:8000')
    args = parser.parse_args()
    try:
        with connect_development() as connection:
            inserted = seed(connection, args.uploads_dir, args.api_base_url)
        print(json.dumps({'inserted': inserted, 'existing_records': 'left unchanged'}))
        return 0
    except (DevelopmentDatabaseError, OSError) as error:
        message = str(error) if isinstance(error, DevelopmentDatabaseError) else 'Could not create the local sample images.'
        print(message, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
