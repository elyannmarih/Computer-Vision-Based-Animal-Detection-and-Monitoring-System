from datetime import datetime, timezone
from io import BytesIO
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError

from . import detector, storage
from . import schemas as s
from .crud import Conn

router = APIRouter()

# Same limits as the frontend upload page
MAX_SIZE = 10 * 1024 * 1024
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def model_id(conn) -> UUID:
    """The models row for the current detector version, created on first use."""
    row = conn.execute(
        "SELECT model_id FROM models WHERE version_number = %s ORDER BY created_date DESC LIMIT 1",
        [detector.MODEL_VERSION],
    ).fetchone()
    if row:
        return row["model_id"]
    return conn.execute(
        "INSERT INTO models (version_number) VALUES (%s) RETURNING model_id", [detector.MODEL_VERSION]
    ).fetchone()["model_id"]


@router.post("/analyze", response_model=s.AnalysisResult, status_code=201, tags=["analysis"])
def analyze(
    request: Request,
    conn: Conn,
    image: Annotated[UploadFile, File(description="JPG, PNG or WEBP, max 10 MB")],
    camera_id: Annotated[UUID | None, Form()] = None,
    captured_at: Annotated[datetime | None, Form()] = None,
):
    """Store an image, run the lizard detector on it, and save the detections."""
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

    found = detector.detect(data)
    targets = sum(d.class_label == detector.TARGET_LABEL for d in found)
    now = datetime.now(timezone.utc)

    key, url = storage.save(data, extension, image.content_type, str(request.base_url))
    try:
        mid = model_id(conn)
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
    except Exception:
        storage.delete(key)  # don't leave an orphaned file if the database write fails
        raise
    return {"image": row, "detections": detections, "model_version": detector.MODEL_VERSION}


@router.post(
    "/detections/{detection_id}/verify",
    response_model=s.HumanVerificationRead,
    status_code=201,
    tags=["detections"],
)
def verify_detection(detection_id: UUID, body: s.DetectionVerification, conn: Conn):
    """Record a person's verdict on one detection and update its image's verification totals."""
    det = conn.execute(
        "SELECT image_id, class_label FROM detections WHERE detection_id = %s FOR UPDATE", [detection_id]
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
    # The image counts as verified once every detection on it has been reviewed
    conn.execute(
        """
        UPDATE images i SET
            verification_id = %(vid)s,
            human_verified = NOT EXISTS (
                SELECT 1 FROM detections d WHERE d.image_id = i.image_id AND NOT d.human_verified),
            number_targets_verified = (
                SELECT count(*) FROM detections d JOIN human_verifications v USING (verification_id)
                WHERE d.image_id = i.image_id AND v.target_found)
        WHERE i.image_id = %(image_id)s
        """,
        {"vid": verification["verification_id"], "image_id": det["image_id"]},
    )
    return verification
