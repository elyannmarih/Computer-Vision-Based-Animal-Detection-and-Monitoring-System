from typing import Annotated
from types import GenericAlias
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg import sql
from pydantic import BaseModel

from .db import DatabaseConnection, get_conn

Conn = Annotated[DatabaseConnection, Depends(get_conn)]


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

    def list_rows(params: BaseModel, conn: Conn):
        where = params.model_dump(exclude_none=True)
        limit, offset = where.pop("limit"), where.pop("offset")
        clause = (
            sql.SQL(" AND ").join(sql.SQL("{} = %s").format(sql.Identifier(c)) for c in where)
            if where
            else sql.SQL("TRUE")
        )
        query = sql.SQL("SELECT * FROM {} WHERE {} ORDER BY {} DESC LIMIT %s OFFSET %s").format(
            tbl, clause, sql.Identifier(order_by)
        )
        return conn.execute(query, [*where.values(), limit, offset]).fetchall()

    # FastAPI needs each concrete schema at runtime; the function body uses BaseModel.
    list_rows.__annotations__["params"] = Annotated[filters, Query()]
    router.add_api_route("", list_rows, methods=["GET"], response_model=GenericAlias(list, read))

    @router.get("/{row_id}", response_model=read)
    def get_row(row_id: UUID, conn: Conn):
        query = sql.SQL("SELECT * FROM {} WHERE {} = %s").format(tbl, pk_col)
        if row := conn.execute(query, [row_id]).fetchone():
            return row
        raise not_found()

    def create_row(body: BaseModel, conn: Conn):
        # exclude_unset lets the database fill in its own defaults
        data = body.model_dump(exclude_unset=True)
        query = sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING *").format(
            tbl,
            sql.SQL(", ").join(map(sql.Identifier, data)),
            sql.SQL(", ").join(sql.Placeholder() * len(data)),
        )
        return conn.execute(query, list(data.values())).fetchone()

    create_row.__annotations__["body"] = create
    router.add_api_route("", create_row, methods=["POST"], response_model=read, status_code=201)

    def update_row(row_id: UUID, body: BaseModel, conn: Conn):
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

    update_row.__annotations__["body"] = update
    router.add_api_route("/{row_id}", update_row, methods=["PATCH"], response_model=read)

    @router.delete("/{row_id}", status_code=204)
    def delete_row(row_id: UUID, conn: Conn):
        query = sql.SQL("DELETE FROM {} WHERE {} = %s").format(tbl, pk_col)
        if conn.execute(query, [row_id]).rowcount == 0:
            raise not_found()
        return Response(status_code=204)

    return router
