"""Database setup must require an explicit local development target."""
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

from development_db import DevelopmentDatabaseError, connect_development, connection_settings


class DevelopmentDatabaseSafetyTests(unittest.TestCase):
    def test_local_development_and_test_targets_are_accepted(self):
        for name in ['detectra_dev', 'detectra_test', 'detectra_test_abc123']:
            settings = connection_settings(f'postgresql://demo:example@127.0.0.1:5432/{name}')
            self.assertEqual(settings['dbname'], name)

    def test_remote_or_implicit_hosts_are_rejected(self):
        for value in ['postgresql://demo:example@db.example.invalid/detectra_dev',
                      'dbname=detectra_dev user=demo',
                      'postgresql://demo@127.0.0.1,remote.example.invalid/detectra_dev']:
            with self.subTest(value=value), self.assertRaises(DevelopmentDatabaseError):
                connection_settings(value)

    def test_database_name_must_identify_development_or_testing(self):
        for name in ['postgres', 'neondb', 'detectra', 'detectra_production']:
            with self.subTest(name=name), self.assertRaises(DevelopmentDatabaseError):
                connection_settings(f'postgresql://demo@localhost/{name}')

    def test_service_hostaddr_and_arbitrary_options_are_rejected(self):
        for extra in ['hostaddr=203.0.113.1', 'service=production', 'options=-csearch_path=private']:
            with self.subTest(extra=extra), self.assertRaises(DevelopmentDatabaseError):
                connection_settings('host=localhost dbname=detectra_dev user=demo '+extra)

    def test_application_database_url_is_never_a_fallback(self):
        with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://private:secret@db.example.invalid/neondb'}, clear=True):
            with patch('development_db.psycopg.connect') as connect:
                with self.assertRaises(DevelopmentDatabaseError):
                    with connect_development():
                        self.fail('An implicit application database connection was opened')
                connect.assert_not_called()

    def test_invalid_connection_string_does_not_expose_its_value(self):
        with self.assertRaises(DevelopmentDatabaseError) as raised:
            connection_settings('password=do-not-display invalid-setting')
        self.assertNotIn('do-not-display', str(raised.exception))

    def test_missing_user_is_rejected(self):
        with self.assertRaises(DevelopmentDatabaseError):
            connection_settings('host=localhost dbname=detectra_dev')

    def test_cli_refuses_missing_configuration_without_loading_dotenv(self):
        environment = os.environ.copy()
        environment.pop('DETECTRA_DEV_DATABASE_URL', None)
        environment['DATABASE_URL'] = 'postgresql://private:do-not-display@db.example.invalid/neondb'
        root = Path(__file__).resolve().parents[1]
        for script in ['init_db.py', 'seed.py']:
            with self.subTest(script=script):
                result = subprocess.run([sys.executable, str(root/script)], env=environment,
                                        capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, 1)
                self.assertIn('DETECTRA_DEV_DATABASE_URL', result.stderr)
                self.assertNotIn('do-not-display', result.stderr+result.stdout)

    def test_connection_failure_returns_a_safe_error(self):
        environment = os.environ.copy()
        environment['DETECTRA_DEV_DATABASE_URL'] = 'postgresql://demo:do-not-display@127.0.0.1:1/detectra_test'
        script = Path(__file__).resolve().parents[1]/'init_db.py'
        result = subprocess.run([sys.executable, str(script)], env=environment,
                                capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Development database operation failed', result.stderr)
        self.assertNotIn('do-not-display', result.stderr+result.stdout)
