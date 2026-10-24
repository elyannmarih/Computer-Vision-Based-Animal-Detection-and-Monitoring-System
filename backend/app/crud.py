from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg import Connection, sql
from pydantic import BaseModel

from .db import get_conn

Conn = Annotated[Connection, Depends(get_conn)]


def crud_router(
    *,
    table: str,
    pk: str,
    create: type[BaseModel],
    update: type[BaseModel],
    read: type[BaseModel],
    filters: type[BaseModel],
    order_by: str = "created_at",
) -> APIRouter:
    """List / get / create / patch / delete endpoints for one table."""
    router = APIRouter(prefix="/" + table.replace("_", "-"), tags=[table])
    tbl, pk_col = sql.Identifier(table), sql.Identifier(pk)

    def not_found() -> HTTPException:
        return HTTPException(404, f"{table} row not found")

    @router.get("", response_model=list[read])
    def list_rows(params: Annotated[filters, Query()], conn: Conn):
        where = params.model_dump(exclude={"limit", "offset"}, exclude_none=True)
        clause = (
            sql.SQL(" AND ").join(sql.SQL("{} = %s").format(sql.Identifier(c)) for c in where)
            if where
            else sql.SQL("TRUE")
        )
        query = sql.SQL("SELECT * FROM {} WHERE {} ORDER BY {} DESC LIMIT %s OFFSET %s").format(
            tbl, clause, sql.Identifier(order_by)
        )
        return conn.execute(query, [*where.values(), params.limit, params.offset]).fetchall()

    @router.get("/{row_id}", response_model=read)
    def get_row(row_id: UUID, conn: Conn):
        query = sql.SQL("SELECT * FROM {} WHERE {} = %s").format(tbl, pk_col)
        if row := conn.execute(query, [row_id]).fetchone():
            return row
        raise not_found()

    @router.post("", response_model=read, status_code=201)
    def create_row(body: create, conn: Conn):
        # exclude_unset lets the database fill in its own defaults
        data = body.model_dump(exclude_unset=True)
        query = sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING *").format(
            tbl,
            sql.SQL(", ").join(map(sql.Identifier, data)),
            sql.SQL(", ").join(sql.Placeholder() * len(data)),
        )
        return conn.execute(query, list(data.values())).fetchone()

    @router.patch("/{row_id}", response_model=read)
    def update_row(row_id: UUID, body: update, conn: Conn):
        data = body.model_dump(exclude_unset=True)
        if not data:
            return get_row(row_id, conn)
        query = sql.SQL("UPDATE {} SET {} WHERE {} = %s RETURNING *").format(
            tbl,
            sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(c)) for c in data),
            pk_col,
        )
        if row := conn.execute(query, [*data.values(), row_id]).fetchone():
            return row
        raise not_found()

    @router.delete("/{row_id}", status_code=204)
    def delete_row(row_id: UUID, conn: Conn):
        query = sql.SQL("DELETE FROM {} WHERE {} = %s").format(tbl, pk_col)
        if conn.execute(query, [row_id]).rowcount == 0:
            raise not_found()
        return Response(status_code=204)

    return router
