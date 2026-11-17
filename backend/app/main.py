import os
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from psycopg import errors

from . import analysis, camera, detector_routes, storage
from . import schemas as s
from .crud import Conn, crud_router
from .db import pool
from .verification import lock_image, update_image_verification


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        pool.open(wait=True, timeout=30)
        camera.start()
        yield
    finally:
        try:
            camera.stop()
        finally:
            pool.close()


app = FastAPI(title="Detectra API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

if not storage.using_s3():
    storage.UPLOAD_DIR.mkdir(exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=storage.UPLOAD_DIR), name="uploads")


@app.exception_handler(errors.IntegrityError)
def integrity_error(request: Request, exc: errors.IntegrityError):
    # FK, NOT NULL, CHECK and UNIQUE violations become client errors, not 500s
    return JSONResponse(status_code=409, content={"detail": exc.diag.message_primary or str(exc)})


@app.get("/health", tags=["meta"])
def health(conn: Conn):
    conn.execute("SELECT 1")
    return {"status": "ok", "storage": "s3" if storage.using_s3() else "local"}


app.include_router(analysis.router)
app.include_router(camera.router)
app.include_router(detector_routes.router)


app.include_router(crud_router(
    table="cameras", pk="camera_id",
    create=s.CameraCreate, update=s.CameraUpdate, read=s.CameraRead, filters=s.CameraFilter,
))
app.include_router(crud_router(
    table="models", pk="model_id", order_by="created_date",
    create=s.ModelCreate, update=s.ModelUpdate, read=s.ModelRead, filters=s.ModelFilter,
))
app.include_router(crud_router(
    table="trusted_persons", pk="trusted_person_id",
    create=s.TrustedPersonCreate, update=s.TrustedPersonUpdate, read=s.TrustedPersonRead,
    filters=s.TrustedPersonFilter,
))
app.include_router(crud_router(
    table="human_verifications", pk="verification_id",
    create=s.HumanVerificationCreate, update=s.HumanVerificationUpdate, read=s.HumanVerificationRead,
    filters=s.HumanVerificationFilter,
))
app.include_router(crud_router(
    table="images", pk="image_id",
    create=s.ImageCreate, update=s.ImageUpdate, read=s.ImageRead, filters=s.ImageFilter,
))
app.include_router(crud_router(
    table="detections", pk="detection_id",
    create=s.DetectionCreate, update=s.DetectionUpdate, read=s.DetectionRead, filters=s.DetectionFilter,
))


@app.post("/images/{image_id}/verify", response_model=s.HumanVerificationRead, status_code=201, tags=["images"])
def verify_image(image_id: UUID, body: s.ImageVerification, conn: Conn):
    """Record a human verification and link it to the image and its detections in one transaction."""
    lock_image(conn, image_id)
    if body.detection_ids is not None:
        selected = body.detection_ids
        if not selected or len(set(selected)) != len(selected):
            raise HTTPException(422, "Select a nonempty set of unique detections, or omit detection_ids for the whole image")
        rows = conn.execute("SELECT detection_id FROM detections WHERE image_id = %s", [image_id]).fetchall()
        if not set(map(str, selected)).issubset({str(row["detection_id"]) for row in rows}):
            raise HTTPException(422, "Every detection must belong to this image")

    verification = conn.execute(
        "INSERT INTO human_verifications (verified_by_id, target_found) VALUES (%s, %s) RETURNING *",
        [body.verified_by_id, body.target_found],
    ).fetchone()
    assert verification is not None  # INSERT ... RETURNING always returns the inserted row.
    vid = verification["verification_id"]

    if body.detection_ids is None:
        conn.execute(
            "UPDATE detections SET human_verified = true, verification_id = %s WHERE image_id = %s",
            [vid, image_id],
        )
    else:
        conn.execute(
            "UPDATE detections SET human_verified = true, verification_id = %s"
            " WHERE image_id = %s AND detection_id = ANY(%s)",
            [vid, image_id, body.detection_ids],
        )
    update_image_verification(conn, image_id, vid)
    return verification
