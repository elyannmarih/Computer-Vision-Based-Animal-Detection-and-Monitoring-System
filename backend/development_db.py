"""Explicit, local-only database access for setup and sample-data scripts.

Never reads .env or falls back to the application's DATABASE_URL.
"""
from contextlib import contextmanager
import os
from pathlib import Path
import re
from collections.abc import Iterator

import psycopg
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row

TABLES = {'cameras', 'models', 'trusted_persons', 'human_verifications', 'images', 'detections'}
SCHEMA_MARKER = 'Detectra development schema v1'
SCHEMA_PATH = Path(__file__).parent / 'database/schema.sql'


class DevelopmentDatabaseError(ValueError):
    """A safe error message that does not include connection credentials."""


def connection_settings(value: str | None) -> dict[str, str]:
    if not value:
        raise DevelopmentDatabaseError('Set DETECTRA_DEV_DATABASE_URL explicitly; DATABASE_URL is not used.')
    try:
        settings = conninfo_to_dict(value)
    except psycopg.Error:
        raise DevelopmentDatabaseError('Invalid development database connection settings.') from None
    allowed = {'host', 'port', 'dbname', 'user', 'password', 'sslmode'}
    if set(settings) - allowed:
        raise DevelopmentDatabaseError('Only host, port, dbname, user, password and sslmode are accepted.')
    if settings.get('host') not in {'127.0.0.1', 'localhost', '::1'}:
        raise DevelopmentDatabaseError('Development setup only accepts a local PostgreSQL host.')
    if not re.fullmatch(r'detectra_(dev|test)(_[a-z0-9]+)?', settings.get('dbname', '')):
        raise DevelopmentDatabaseError('Use a database named detectra_dev or detectra_test, optionally with an underscore suffix.')
    if not settings.get('user'):
        raise DevelopmentDatabaseError('Specify a development database user explicitly.')
    return settings


@contextmanager
def connect_development() -> Iterator[psycopg.Connection]:
    settings = connection_settings(os.environ.get('DETECTRA_DEV_DATABASE_URL'))
    # Pass an explicit hostaddr as well, so libpq environment settings cannot redirect localhost.
    address = '::1' if settings['host'] == '::1' else '127.0.0.1'
    try:
        with psycopg.connect(**settings, hostaddr=address, connect_timeout=5,
                             options='-c search_path=public -c lock_timeout=5000 -c statement_timeout=30000',
                             row_factory=dict_row) as connection:
            connection.execute('SELECT pg_advisory_xact_lock(553003)')
            yield connection
    except psycopg.Error:
        raise DevelopmentDatabaseError('Development database operation failed. Check the local server, credentials, permissions and schema; no partial transaction was committed.') from None


def existing_tables(connection: psycopg.Connection) -> set[str]:
    return {row['tablename'] for row in connection.execute(
        "SELECT tablename FROM pg_tables WHERE schemaname='public'").fetchall()}


def require_initialized(connection: psycopg.Connection) -> None:
    if not TABLES.issubset(existing_tables(connection)):
        raise DevelopmentDatabaseError('Initialize an empty development database before loading sample data.')
    marker = connection.execute("SELECT obj_description('public.cameras'::regclass) AS marker").fetchone()
    if not marker or marker['marker'] != SCHEMA_MARKER:
        raise DevelopmentDatabaseError('This schema was not created by Detectra development setup; existing data was left unchanged.')


def initialize(connection: psycopg.Connection) -> bool:
    if existing_tables(connection):
        require_initialized(connection)
        return False
    connection.execute(SCHEMA_PATH.read_text(encoding='utf-8'))
    return True
