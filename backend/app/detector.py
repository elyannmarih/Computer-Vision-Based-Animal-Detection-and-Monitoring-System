"""Lizard detector.

STUB: there is no trained model yet. `detect` returns plausible, deterministic
fake detections (the same image always gives the same result) so the rest of
the pipeline can be built and tested. Replace the body of `detect` with real
inference and bump MODEL_VERSION; callers don't need to change.
"""
import hashlib
import random
from dataclasses import dataclass

TARGET_LABEL = "lizard"
MODEL_VERSION = "stub-0.1"


@dataclass
class Detection:
    class_label: str
    confidence: float
    # Normalized to the full image, values in [0, 1]
    x_min: float
    y_min: float
    width: float
    height: float


def detect(image: bytes) -> list[Detection]:
    rng = random.Random(hashlib.sha256(image).digest())
    detections = []
    for _ in range(rng.choice([0, 1, 1, 2, 2, 3])):
        width, height = round(rng.uniform(0.08, 0.35), 4), round(rng.uniform(0.08, 0.35), 4)
        detections.append(Detection(
            class_label=TARGET_LABEL,
            confidence=round(rng.uniform(0.55, 0.98), 4),
            x_min=round(rng.uniform(0, 1 - width), 4),
            y_min=round(rng.uniform(0, 1 - height), 4),
            width=width,
            height=height,
        ))
    return sorted(detections, key=lambda d: d.confidence, reverse=True)
