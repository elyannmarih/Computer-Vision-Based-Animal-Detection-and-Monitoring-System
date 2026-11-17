import os
from collections.abc import Iterator
from typing import Any

from dotenv import load_dotenv
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

load_dotenv()

# Neon suspends idle computes and drops idle connections, so the pool checks
# each connection before handing it out.
DatabaseConnection = Connection[dict[str, Any]]

pool = ConnectionPool[DatabaseConnection](
    os.environ["DATABASE_URL"],
    connection_class=DatabaseConnection,
    min_size=1,
    max_size=10,
    kwargs={"row_factory": dict_row},
    check=ConnectionPool.check_connection,
    open=False,
)


def get_conn() -> Iterator[DatabaseConnection]:
    """One transaction per request: commits on success, rolls back on error."""
    with pool.connection() as conn:
        yield conn
