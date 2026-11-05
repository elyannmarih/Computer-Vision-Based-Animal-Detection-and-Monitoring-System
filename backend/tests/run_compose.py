"""Check built Docker images in a new disposable Compose project.

Requires Docker Compose and backend development dependencies. No developer .env
file, existing database, personal camera or host upload directory is used.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import tempfile
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).parent / 'fixtures/astronaut.png'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, help='Write a JSON result outside the application volumes.')
    parser.add_argument('--compose-file', type=Path, default=ROOT / 'compose.yaml',
                        help='Use the repository configuration or a generated delivery bundle.')
    args = parser.parse_args()
    project = 'detectra_test_' + uuid4().hex
    checks = []
    report = {'project': project, 'started_at_utc': datetime.now(timezone.utc).isoformat(), 'checks': checks}

    def passed(name):
        checks.append(name)
        print('PASS ' + name, flush=True)

    with tempfile.TemporaryDirectory(prefix='detectra-compose-') as directory:
        env_file = Path(directory) / 'compose.env'
        password = secrets.token_hex(24)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        env_file.write_text(f'DETECTRA_DB_PASSWORD={password}\nDETECTRA_WEB_PORT={port}\n')
        environment = {**os.environ, 'DETECTRA_DB_PASSWORD': password, 'DETECTRA_WEB_PORT': str(port),
                       'DETECTRA_CAMERA_RTSP_URL': '', 'DETECTRA_CAMERA_SAVE_INTERVAL': '0',
                       'DETECTRA_CAMERA_NAME': 'Test camera (disabled)', 'COMPOSE_PROFILES': ''}
        command = ['docker', 'compose', '-f', str(args.compose_file.resolve()), '--project-name', project, '--env-file', str(env_file)]

        def compose(*arguments):
            result = subprocess.run([*command, *arguments], cwd=ROOT, env=environment,
                                    text=True, capture_output=True, timeout=240)
            if result.returncode:
                # Redact the generated password even though it is used only by this test run.
                detail = (result.stdout + result.stderr).replace(password, '[redacted]')
                raise RuntimeError(f'Compose {arguments[0]} failed: {detail}')
            return result.stdout

        def snapshot():
            return json.loads(compose('exec', '-T', 'db', 'psql', '-U', 'detectra', '-d', 'detectra_dev', '-Atc',
                "SELECT json_build_object('images',(SELECT count(*) FROM images),"
                "'detections',(SELECT count(*) FROM detections),'reviews',(SELECT count(*) FROM human_verifications));"))

        cleanup_allowed = False
        try:
            compose('config', '--quiet')
            configuration = json.loads(compose('config', '--format', 'json'))
            for volume in configuration.get('volumes', {}).values():
                if volume.get('external') or not volume.get('name', '').startswith(project + '_'):
                    raise RuntimeError('Smoke tests require volumes owned by their temporary project.')
            cleanup_allowed = True
            compose('up', '--detach', '--wait', '--wait-timeout', '180', '--no-build', '--pull', 'never')
            first_ids = compose('ps', '-q').splitlines()
            database_id = compose('ps', '-q', 'db').strip()
            database_info = json.loads(subprocess.check_output(['docker', 'inspect', database_id], text=True))[0]
            report['images'] = {'db': database_info['Image']}
            passed('All three services start healthy with a new database')
            for service in ('frontend', 'backend'):
                container = compose('ps', '-q', service).strip()
                info = json.loads(subprocess.check_output(['docker', 'inspect', container], text=True))[0]
                report.setdefault('images', {})[service] = info['Image']
                assert info['Config']['User'] not in ('', 'root', '0')
                assert info['HostConfig']['ReadonlyRootfs']
                bindings = info['HostConfig']['PortBindings'] or {}
                if service == 'backend':
                    assert not bindings
                else:
                    assert all(binding['HostIp'] == '127.0.0.1' for values in bindings.values() for binding in values)
                    keys = {item.split('=', 1)[0] for item in info['Config']['Env']}
                    assert not keys.intersection({'PGPASSWORD', 'DATABASE_URL', 'CAMERA_RTSP_URL'})
            compose('exec', '-T', 'backend', 'python', '-c',
                "from pathlib import Path; assert not list(Path('/app').rglob('.env*')); "
                "assert not Path('models/selected.txt').exists(); assert not Path('models/selected-classes.json').exists()")
            actual = compose('exec', '-T', 'backend', 'python', '-c',
                "import hashlib; from pathlib import Path; print(hashlib.sha256(Path('models/yolov8s-oiv7/model.pt').read_bytes()).hexdigest())").strip()
            expected = hashlib.sha256((ROOT / 'backend/models/yolov8s-oiv7/model.pt').read_bytes()).hexdigest()
            assert actual == expected
            passed('Non-root applications, read-only code, loopback access and unchanged bundled weights')

            first_seed = json.loads(compose('run', '--rm', '--no-deps', 'seed'))
            second_seed = json.loads(compose('run', '--rm', '--no-deps', 'seed'))
            assert first_seed['inserted']['images'] == 3
            assert all(value == 0 for value in second_seed['inserted'].values())
            passed('Local-only seed creates fixtures once without duplicate records')

            with httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=60) as client:
                def data(response):
                    response.raise_for_status()
                    body = response.json()
                    assert body['ok'] is True, body
                    return body['data']

                assert data(client.get('/api/detectra/health'))['status'] == 'ok'
                assert data(client.get('/api/detectra/live')) == []
                assets = set()
                for route in ('/', '/upload', '/camera', '/how-to-use', '/results', '/settings'):
                    page = client.get(route)
                    assert page.status_code == 200, route
                    assert password not in page.text
                    assets.update(re.findall(r'(?:src|href)="(/_next/static/[^\"]+)"', page.text))
                assert assets
                for asset in assets:
                    response = client.get(asset)
                    assert response.status_code == 200, asset
                    assert password.encode() not in response.content
                passed('Standalone pages, static assets and frontend-to-backend health proxy work')

                example = data(client.get('/api/detectra/results/50000000-0000-0000-0000-000000000001'))
                assert example['simulated'] is True
                assert client.get(example['image']['url']).status_code == 200
                payload = FIXTURE.read_bytes()
                result = data(client.post('/api/detectra/analyze', files={'image': ('astronaut.png', payload, 'image/png')}))
                assert result['modelVersion'] == 'yolov8s-oiv7' and result['simulated'] is False
                person = next(box for box in result['detections'] if box['label'] == 'person')
                assert client.get(result['image']['url']).content == payload
                passed('Real YOLO upload persists and its image is served through the frontend proxy')

                reviewer = data(client.get('/api/detectra/reviewers'))[0]['id']
                data(client.post('/api/detectra/verify', json={'resultId': result['id'], 'detectionId': person['id'],
                                                             'reviewerId': reviewer, 'verdict': 'correct'}))
                reviewed = data(client.get('/api/detectra/results/' + result['id']))
                assert next(box for box in reviewed['detections'] if box['id'] == person['id'])['review'] == 'correct'
                before = snapshot()
                invalid = client.post('/api/detectra/analyze', files={'image': ('broken.png', b'not an image', 'image/png')})
                assert invalid.status_code == 422 and invalid.json()['ok'] is False
                assert snapshot() == before
                passed('Feedback is retrieved from PostgreSQL and corrupt uploads create no rows')

                selection = data(client.patch('/api/detectra/detector', json={'version': 'yolov8s-oiv7', 'classes': ['person']}))
                assert selection['selectedClasses'] == ['person']
                compose('stop', 'backend')
                assert client.get('/api/detectra/health').status_code == 503
                compose('up', '--detach', '--wait', '--wait-timeout', '180', '--no-build', '--pull', 'never', 'backend')
                assert data(client.get('/api/detectra/health'))['status'] == 'ok'
                passed('Frontend reports backend failure and recovers after restart')

                compose('down')  # Preserve named volumes while replacing all containers.
                compose('up', '--detach', '--wait', '--wait-timeout', '180', '--no-build', '--pull', 'never')
                assert not set(first_ids).intersection(compose('ps', '-q').splitlines())
                assert snapshot() == before
                restored = data(client.get('/api/detectra/results/' + result['id']))
                assert next(box for box in restored['detections'] if box['id'] == person['id'])['review'] == 'correct'
                assert client.get(restored['image']['url']).content == payload
                active = next(model for model in data(client.get('/api/detectra/detector')) if model['active'])
                assert active['version'] == 'yolov8s-oiv7' and active['selectedClasses'] == ['person']
                passed('Images, database records, feedback and preferences survive container replacement')
            report['status'] = 'passed'
        except Exception:
            report['status'] = 'failed'
            raise
        finally:
            try:
                # This random project was created above; never remove another project's volumes.
                if not re.fullmatch(r'detectra_test_[0-9a-f]{32}', project):
                    raise RuntimeError('Unexpected test project name; cleanup refused.')
                if cleanup_allowed:
                    compose('down', '--volumes', '--remove-orphans')
                    report['cleanup'] = 'Temporary project containers, networks and volumes removed'
                else:
                    report['cleanup'] = 'Configuration rejected before creating resources'
            except Exception:
                report['status'] = 'failed'
                report['cleanup'] = 'Cleanup failed; inspect the temporary project before removing it'
                raise
            finally:
                report['completed_at_utc'] = datetime.now(timezone.utc).isoformat()
                if args.report:
                    args.report.parent.mkdir(parents=True, exist_ok=True)
                    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(f'{len(checks)} Docker checks passed.', flush=True)


if __name__ == '__main__':
    main()
