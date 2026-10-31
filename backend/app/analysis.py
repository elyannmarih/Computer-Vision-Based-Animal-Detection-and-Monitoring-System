import logging
from datetime import datetime, timezone
from io import BytesIO
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError
from psycopg import IntegrityError
from psycopg.errors import TransactionRollback, SerializationFailure, DeadlockDetected

from . import detector, storage
from . import schemas as s
from .crud import Conn
from .verification import lock_image, update_image_verification

router = APIRouter()
logger = logging.getLogger(__name__)

# Same limits as the frontend upload page
MAX_SIZE = 10 * 1024 * 1024
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def model_id(conn, model: detector.Model) -> UUID:
    """The models row for a detector model version, created on first use."""
    row = conn.execute(
        "SELECT model_id FROM models WHERE version_number = %s ORDER BY created_date DESC LIMIT 1",
        [model.version],
    ).fetchone()
    if row:
        return row["model_id"]
    return conn.execute(
        "INSERT INTO models (version_number, precision_rating) VALUES (%s, %s) RETURNING model_id",
        [model.version, model.precision],
    ).fetchone()["model_id"]


@router.post("/analyze", response_model=s.AnalysisResult, status_code=201, tags=["analysis"])
def analyze(
    request: Request,
    conn: Conn,
    image: Annotated[UploadFile, File(description="JPG, PNG or WEBP, max 10 MB")],
    camera_id: Annotated[UUID | None, Form()] = None,
    captured_at: Annotated[datetime | None, Form()] = None,
):
    """Store an image, run the active detector model on it, and save the detections."""
    extension = EXTENSIONS.get(image.content_type or "")
    if not extension:
        raise HTTPException(415, "Please upload a JPG, PNG, or WEBP image.")
    data = image.file.read(MAX_SIZE + 1)
    if len(data) > MAX_SIZE:
        raise HTTPException(413, "Image size must not exceed 10 MB.")
    try:
        Image.open(BytesIO(data)).verify()
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise HTTPException(422, "This image could not be opened. Choose a valid image.")

    model = detector.active()  # held for the request, in case the active model is switched meanwhile
    found = detector.detect(data, model)
    return record(conn, data, image.content_type, str(request.base_url), model, found, camera_id, captured_at)


def record(
    conn,
    data: bytes,
    content_type: str,
    base_url: str,
    model: detector.Model,
    found: list[detector.Detection],
    camera_id: UUID | None = None,
    captured_at: datetime | None = None,
) -> dict:
    """Store an analyzed image and commit it with its detections; returns an AnalysisResult.

    Used for uploads and for live camera frames.
    """
    targets = sum(detector.is_target(d.class_label) for d in found)
    now = datetime.now(timezone.utc)

    commit_started = False
    key, url = storage.save(data, EXTENSIONS[content_type], content_type, base_url)
    try:
        mid = model_id(conn, model)
        row = conn.execute(
            "INSERT INTO images (camera_id, image_url, captured_at, uploaded_at, targets_detected,"
            " number_detections, number_targets_detected) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *",
            [camera_id, url, captured_at or now, now, targets > 0, len(found), targets],
        ).fetchone()
        detections = [
            conn.execute(
                "INSERT INTO detections (image_id, model_id, class_label, confidence, x_min, y_min, width, height)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
                [row["image_id"], mid, d.class_label, d.confidence, d.x_min, d.y_min, d.width, d.height],
            ).fetchone()
            for d in found
        ]
        # Commit while storage compensation is still in scope. The pool dependency exits idle.
        commit_started = True
        conn.commit()
    except Exception as error:
        try:
            conn.rollback()
        except Exception:
            logger.warning("Analysis rollback failed; inspect the transaction before retrying")
        # A lost commit acknowledgement may mean the transaction DID commit.
        # Retain the image when the outcome is unknown rather than breaking a committed row.
        if not commit_started or isinstance(error, (IntegrityError, TransactionRollback, SerializationFailure, DeadlockDetected)):
            try:
                storage.delete(key)
            except Exception:
                logger.warning("Analysis image cleanup failed; manual cleanup may be required")
        else:
            logger.warning("Analysis commit outcome unknown; retain image and inspect before retrying")
        raise
    return {"image": row, "detections": detections, "model_version": model.version}


@router.post(
    "/detections/{detection_id}/verify",
    response_model=s.HumanVerificationRead,
    status_code=201,
    tags=["detections"],
)
def verify_detection(detection_id: UUID, body: s.DetectionVerification, conn: Conn):
    """Record a person's verdict on one detection and update its image's verification totals."""
    parent = conn.execute("SELECT image_id FROM detections WHERE detection_id = %s", [detection_id]).fetchone()
    if not parent:
        raise HTTPException(404, "detections row not found")
    if body.image_id is not None and str(body.image_id) != str(parent["image_id"]):
        raise HTTPException(422, "Detection does not belong to this image")
    lock_image(conn, parent["image_id"])
    det = conn.execute(
        "SELECT image_id, class_label FROM detections WHERE detection_id = %s AND image_id = %s FOR UPDATE",
        [detection_id, parent["image_id"]],
    ).fetchone()
    if not det:
        raise HTTPException(404, "detections row not found")

    # A "correct" verdict on a lizard detection means a lizard really is there
    target_found = body.verdict == "correct" and det["class_label"] == detector.TARGET_LABEL
    verification = conn.execute(
        "INSERT INTO human_verifications (verified_by_id, target_found) VALUES (%s, %s) RETURNING *",
        [body.verified_by_id, target_found],
    ).fetchone()
    conn.execute(
        "UPDATE detections SET human_verified = true, verification_id = %s WHERE detection_id = %s",
        [verification["verification_id"], detection_id],
    )
    update_image_verification(conn, det["image_id"], verification["verification_id"])
    return verification
