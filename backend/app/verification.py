"""Rules shared by whole-image and individual-detection feedback."""
from uuid import UUID
from fastapi import HTTPException


def lock_image(conn, image_id: UUID) -> None:
    # Both workflows lock the parent first, serializing reviews of the same image.
    if not conn.execute("SELECT 1 FROM images WHERE image_id = %s FOR UPDATE", [image_id]).fetchone():
        raise HTTPException(404, "images row not found")


def update_image_verification(conn, image_id: UUID, verification_id: UUID) -> None:
    """A review confirms an empty image, or completes an image once every box is reviewed.

    number_targets_verified counts confirmed target boxes, not unlocalized missed animals. Every
    detected class is a target (detector.is_target), so dog and deer models count too.
    """
    conn.execute(
        """
        UPDATE images AS i SET
            verification_id = %(vid)s,
            human_verified = NOT EXISTS (
                SELECT 1 FROM detections d WHERE d.image_id = i.image_id AND NOT d.human_verified),
            number_targets_verified = (
                SELECT count(*) FROM detections d JOIN human_verifications v USING (verification_id)
                WHERE d.image_id = i.image_id AND v.target_found)
        WHERE i.image_id = %(image_id)s
        """,
        {"vid": verification_id, "image_id": image_id},
    )
