"""Fill the database with realistic test data.

    python seed.py          # add test data
    python seed.py --reset  # wipe ALL rows in every table first, then add test data
"""
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

from app.db import pool

random.seed(42)  # same data every run

TARGET_LABEL = "lizard"
# Things a backyard camera picks up besides lizards, weighted toward lizards
LABELS = ["lizard", "lizard", "lizard", "bird", "snake", "insect", "cat"]
NOW = datetime.now(timezone.utc).replace(microsecond=0)


def seed(conn):
    models = [
        conn.execute(
            "INSERT INTO models (version_number, precision_rating, created_date) VALUES (%s, %s, %s) RETURNING model_id",
            [version, precision, NOW - timedelta(days=days)],
        ).fetchone()["model_id"]
        for version, precision, days in [("v1.0.0", 0.78, 120), ("v1.1.0", 0.84, 60), ("v2.0.0", 0.91, 14)]
    ]
    current_model = models[-1]

    cameras = [
        conn.execute(
            "INSERT INTO cameras (rtsp_stream_url, location_name, enabled) VALUES (%s, %s, %s) RETURNING camera_id",
            [f"rtsp://192.168.1.{10 + i}:554/stream1", name, enabled],
        ).fetchone()["camera_id"]
        for i, (name, enabled) in enumerate([
            ("Front Door", True), ("Driveway", True), ("Backyard", True), ("Garage", False),
        ])
    ]
    active_cameras = cameras[:3]

    account_id = uuid.uuid4()
    persons = [
        conn.execute(
            "INSERT INTO trusted_persons (primary_account_id, first_name, last_name, email, phone_number,"
            " receive_email, receive_sms) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING trusted_person_id",
            [account_id, first, last, f"{first.lower()}.{last.lower()}@example.com", phone, email, sms],
        ).fetchone()["trusted_person_id"]
        for first, last, phone, email, sms in [
            ("Alex", "Rivera", "555-0101", True, True),
            ("Jordan", "Lee", "555-0102", True, False),
            ("Sam", "Patel", "555-0103", False, True),
        ]
    ]

    n_images = n_detections = n_verified = 0
    for i in range(40):
        captured = NOW - timedelta(minutes=random.randint(5, 7 * 24 * 60))
        boxes = [random.choice(LABELS) for _ in range(random.choice([0, 0, 1, 1, 2, 3, 4]))]
        targets = boxes.count(TARGET_LABEL)

        image_id = conn.execute(
            "INSERT INTO images (camera_id, image_url, captured_at, uploaded_at, targets_detected,"
            " number_detections, number_targets_detected) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING image_id",
            [random.choice(active_cameras), f"https://picsum.photos/seed/detectra{i}/1280/720", captured,
             captured + timedelta(seconds=random.randint(1, 20)), targets > 0, len(boxes), targets],
        ).fetchone()["image_id"]
        n_images += 1

        for label in boxes:
            w, h = round(random.uniform(0.05, 0.4), 4), round(random.uniform(0.1, 0.6), 4)
            conn.execute(
                "INSERT INTO detections (image_id, model_id, class_label, confidence, x_min, y_min, width, height,"
                " created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                [image_id, current_model if random.random() < 0.8 else random.choice(models[:2]), label,
                 round(random.uniform(0.45, 0.99), 4), round(random.uniform(0, 1 - w), 4),
                 round(random.uniform(0, 1 - h), 4), w, h, captured],
            )
            n_detections += 1

        # About half the images that have detections get a human review.
        if boxes and random.random() < 0.5:
            found = targets > 0 and random.random() < 0.85
            vid = conn.execute(
                "INSERT INTO human_verifications (verified_by_id, target_found, verified_at) VALUES (%s, %s, %s)"
                " RETURNING verification_id",
                [random.choice(persons), found, captured + timedelta(minutes=random.randint(1, 90))],
            ).fetchone()["verification_id"]
            conn.execute(
                "UPDATE images SET human_verified = true, verification_id = %s, number_targets_verified = %s"
                " WHERE image_id = %s",
                [vid, targets if found else 0, image_id],
            )
            conn.execute(
                "UPDATE detections SET human_verified = true, verification_id = %s WHERE image_id = %s",
                [vid, image_id],
            )
            n_verified += 1

    print(f"models: {len(models)}, cameras: {len(cameras)}, trusted persons: {len(persons)}, "
          f"images: {n_images}, detections: {n_detections}, verifications: {n_verified}")


if __name__ == "__main__":
    with pool:
        with pool.connection() as conn:
            if "--reset" in sys.argv:
                conn.execute("TRUNCATE detections, images, human_verifications, trusted_persons, cameras, models")
                print("cleared all tables")
            seed(conn)
