"""Create Detectra's tables in an explicitly selected, empty local development database."""
import sys

from development_db import DevelopmentDatabaseError, connect_development, initialize


def main() -> int:
    try:
        with connect_development() as connection:
            created = initialize(connection)
        print('Development schema created.' if created else 'Development schema already initialized; no changes made.')
        return 0
    except DevelopmentDatabaseError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
