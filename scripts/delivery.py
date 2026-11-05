"""Package, verify and load a tested local Docker delivery. Never pushes images."""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

import yaml

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {'backend': 'detectra-backend:local', 'frontend': 'detectra-frontend:local', 'db': 'postgres:16'}
FILES = {'images.tar.gz', 'compose.yaml', '.env.compose.example', 'backend/database/schema.sql',
         'START.txt', 'manifest.json', 'smoke-test.json'}


def run(*command):
    return subprocess.check_output(command, cwd=ROOT, text=True).strip()


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def package(output, smoke_path, allow_dirty):
    revision = run('git', 'rev-parse', 'HEAD')
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('A full Git commit is required.')
    dirty = bool(run('git', 'status', '--porcelain'))
    if dirty and not allow_dirty:
        raise ValueError('The working tree has uncommitted changes. Use --allow-dirty only for a local development preview.')
    if output.exists():
        raise ValueError('Choose a new output directory; existing bundles are never overwritten.')
    smoke = json.loads(smoke_path.read_text())
    if smoke.get('status') != 'passed' or len(smoke.get('checks', [])) != 8 or 'cleanup' not in smoke:
        raise ValueError('A completed successful Docker smoke report is required.')
    images = {}
    tag = revision + ('-dev' if dirty else '')
    for service, source in SOURCES.items():
        info = json.loads(run('docker', 'image', 'inspect', source))[0]
        if (info['Os'], info['Architecture']) != ('linux', 'amd64'):
            raise ValueError('This delivery currently supports Linux amd64 images only.')
        if smoke.get('images', {}).get(service) != info['Id']:
            raise ValueError(f'The {service} image differs from the tested image. Run the smoke test again.')
        if service != 'db':
            if info['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != revision:
                raise ValueError(f'Rebuild {service} with DETECTRA_REVISION set to the current commit.')
        target = f"detectra-{'postgres' if service == 'db' else service}:{tag}"
        images[service] = {'source': source, 'tag': target, 'id': info['Id'], 'source_digests': info.get('RepoDigests', [])}
    output.mkdir(parents=True)
    for item in images.values():
        run('docker', 'image', 'tag', item['source'], item['tag'])
    # Export the image contents, not running containers or their data volumes.
    with tempfile.TemporaryFile() as errors, (output / 'images.tar.gz').open('wb') as archive:
        with subprocess.Popen(['docker', 'image', 'save', *[item['tag'] for item in images.values()]],
                              stdout=subprocess.PIPE, stderr=errors) as process:
            with gzip.GzipFile(fileobj=archive, mode='wb', filename='', mtime=0, compresslevel=1) as compressed:
                shutil.copyfileobj(process.stdout, compressed, length=1024 * 1024)
            if process.wait() != 0:
                raise RuntimeError('Docker image export failed; the output directory is incomplete.')
    compose = yaml.safe_load((ROOT / 'compose.yaml').read_text())
    for service, configuration in compose['services'].items():
        configuration.pop('build', None)
        configuration['image'] = images['backend' if service == 'seed' else service]['tag']
    (output / 'compose.yaml').write_text(yaml.safe_dump(compose, sort_keys=False), encoding='utf-8')
    for name in ('.env.compose.example', 'backend/database/schema.sql'):
        destination = output / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, destination)
    shutil.copyfile(smoke_path, output / 'smoke-test.json')
    manifest = {'revision': revision, 'development_preview': dirty, 'platform': 'linux/amd64',
                'created_at_utc': datetime.now(timezone.utc).isoformat(), 'images': images,
                'postgres_source': 'Official PostgreSQL image; bundled unchanged under a versioned local tag.'}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (output / 'START.txt').write_text(f'''Detectra - local Docker delivery
Revision: {revision}
Development preview: {dirty}
Platform: Linux amd64 (Docker Desktop must use Linux containers)

1. Check the files against SHA256SUMS before loading them.
   In PowerShell, Get-FileHash -Algorithm SHA256 images.tar.gz prints its checksum.
   From a repository checkout, python scripts/delivery.py verify --bundle <folder> checks all files.
2. Run: docker load --input images.tar.gz
3. Copy .env.compose.example to .env.compose and choose a local database password.
4. Run: docker compose --env-file .env.compose up -d --wait --no-build --pull never
5. Load the fictional examples: docker compose --env-file .env.compose run --rm seed
6. Open http://localhost:3000 and use Demo Reviewer for feedback.

The package includes the database image and schema; no source build or image registry is needed.
The application has no authentication and is bound to localhost. No camera is opened by default.
Do not replace an existing .env.compose when upgrading. Back up data and keep the same Compose
project name if you intend to reuse its database, uploads and preferences.
Stop with: docker compose --env-file .env.compose down
Named volumes survive this command. Adding --volumes deletes the project's stored data.
The manifest records the source commit and image IDs; smoke-test.json records the tested images.
''', encoding='utf-8')
    checksums = ''.join(f'{digest(output / name)}  {name}\n' for name in sorted(FILES))
    (output / 'SHA256SUMS').write_text(checksums, encoding='utf-8')
    print(f'Created {"development preview" if dirty else "delivery"} for {revision}: {output}')


def verify(bundle, load=False):
    bundle = bundle.resolve()
    entries = {}
    for line in (bundle / 'SHA256SUMS').read_text().splitlines():
        checksum, name = line.split('  ', 1)
        if name in entries or not re.fullmatch(r'[0-9a-f]{64}', checksum):
            raise ValueError('Invalid checksum manifest.')
        entries[name] = checksum
    if set(entries) != FILES:
        raise ValueError('The bundle has an unexpected checksum file list.')
    for name, checksum in entries.items():
        path = (bundle / name).resolve()
        if not path.is_relative_to(bundle) or not path.is_file() or digest(path) != checksum:
            raise ValueError(f'Checksum verification failed: {name}')
    manifest = json.loads((bundle / 'manifest.json').read_text())
    if not re.fullmatch(r'[0-9a-f]{40}', manifest['revision']) or manifest['platform'] != 'linux/amd64':
        raise ValueError('Invalid delivery revision or platform.')
    if load:
        subprocess.run(['docker', 'image', 'load', '--input', str(bundle / 'images.tar.gz')], check=True)
        for item in manifest['images'].values():
            if json.loads(run('docker', 'image', 'inspect', item['tag']))[0]['Id'] != item['id']:
                raise ValueError('A loaded image does not match the delivery manifest.')
    print(f'Verified {len(entries)} checksums' + (' and loaded matching Docker images.' if load else '.'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    create = commands.add_parser('package')
    create.add_argument('--output', type=Path, required=True)
    create.add_argument('--smoke-report', type=Path, required=True)
    create.add_argument('--allow-dirty', action='store_true')
    for command in ('verify', 'load'):
        commands.add_parser(command).add_argument('--bundle', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'package':
        package(args.output.resolve(), args.smoke_report, args.allow_dirty)
    else:
        verify(args.bundle, load=args.command == 'load')


if __name__ == '__main__':
    main()
