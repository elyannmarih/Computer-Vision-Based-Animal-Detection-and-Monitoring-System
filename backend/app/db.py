import os
from collections.abc import Iterator

from dotenv import load_dotenv
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

load_dotenv()

# Neon suspends idle computes and drops idle connections, so the pool checks
# each connection before handing it out.
pool = ConnectionPool(
    os.environ["DATABASE_URL"],
    min_size=1,
    max_size=10,
    kwargs={"row_factory": dict_row},
    check=ConnectionPool.check_connection,
    open=False,
)


def get_conn() -> Iterator[Connection]:
    """One transaction per request: commits on success, rolls back on error."""
    with pool.connection() as conn:
        yield conn
