"""Lizard detector.

Runs YOLO models trained by training/train_lizard.py. Each model lives in its
own folder, models/<name>/ (model.pt + model.json with its metrics), and its
folder name is the version recorded in the models table. The model used is
LIZARD_MODEL if set, otherwise the one named in models/active.txt;
`use_model` switches it while the app runs.

With no model configured, `detect` falls back to a STUB that returns plausible,
deterministic fake detections (the same image always gives the same result)
under version "stub-0.1", so the rest of the pipeline still works.
"""
import hashlib
import json
import logging
import os
import random
import threading
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image, ImageOps

load_dotenv()

log = logging.getLogger(__name__)

TARGET_LABEL = "lizard"

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
CONFIDENCE = float(os.getenv("LIZARD_CONFIDENCE", "0.25"))


@dataclass(frozen=True)
class Model:
    version: str  # folder name under models/
    precision: float | None = None  # measured on held-out images when the model was trained
    info: dict = field(default_factory=dict, compare=False)  # everything in model.json
    weights: Path | None = None  # None for the stub


STUB = Model("stub-0.1")


@dataclass
class Detection:
    class_label: str
    confidence: float
    # Normalized to the full image, values in [0, 1]
    x_min: float
    y_min: float
    width: float
    height: float


def available_models() -> list[Model]:
    """Every trained model under models/, newest first."""
    models = [load_model(p.parent.name) for p in MODELS_DIR.glob("*/model.pt")]
    return sorted(models, key=lambda m: m.info.get("trained_at", ""), reverse=True)


def load_model(version: str) -> Model:
    folder = MODELS_DIR / version
    if not (folder / "model.pt").is_file():
        raise ValueError(f"No model named {version!r} in {MODELS_DIR}")
    info = json.loads((folder / "model.json").read_text()) if (folder / "model.json").exists() else {}
    return Model(version, info.get("precision"), info, folder / "model.pt")


_lock = threading.Lock()  # Ultralytics predictors aren't thread-safe; FastAPI runs requests in a thread pool
_loaded = {}  # weights path -> YOLO, so switching back and forth doesn't reload


def active() -> Model:
    return _active


def use_model(version: str) -> Model:
    """Make `version` the model used by later `detect` calls (requests already running keep theirs)."""
    global _active
    model = load_model(version)
    _yolo(model)  # load now so a bad weights file fails here, not on the next upload
    _active = model
    return model


def _yolo(model: Model):
    with _lock:
        if model.weights not in _loaded:
            from ultralytics import YOLO

            _loaded[model.weights] = YOLO(model.weights)
        return _loaded[model.weights]


def is_target(class_label: str) -> bool:
    """Whether a detection counts toward an image's targets. Every class does, people included."""
    return True


def label(name: str) -> str:
    """Map dataset class names (the Roboflow set calls it "Lizards") to the labels Detectra stores."""
    return TARGET_LABEL if name.lower().startswith("lizard") else name.lower()


def detect(image: bytes, model: Model | None = None) -> list[Detection]:
    """Run `model` (default: the active one) on an image. Pass the model to know which one produced the result."""
    model = model or _active
    if model.weights is None:
        return _stub_detect(image)

    # Browsers apply EXIF rotation when showing the image, so boxes must be in that orientation too
    return _predict(ImageOps.exif_transpose(Image.open(BytesIO(image))).convert("RGB"), model)


def detect_frame(frame, model: Model | None = None) -> list[Detection]:
    """Run `model` (default: the active one) on a video frame, a BGR numpy array as OpenCV reads it."""
    model = model or _active
    if model.weights is None:
        return _stub_detect(frame.tobytes()[:1 << 16])
    return _predict(frame, model)


def _predict(picture, model: Model) -> list[Detection]:
    """`picture` is an RGB PIL image or a BGR numpy array (Ultralytics' conventions for each)."""
    yolo = _yolo(model)
    # A model can limit itself to some of its classes and rename them (model.json "class_map",
    # e.g. Open Images' Man/Woman/Boy/Girl -> person). Overlapping boxes are merged across those
    # classes, so one person isn't reported as both "Man" and "Person".
    class_map = model.info.get("class_map")
    options = {"classes": [i for i, n in yolo.names.items() if n in class_map], "agnostic_nms": True} if class_map else {}
    with _lock:
        result = yolo.predict(picture, conf=CONFIDENCE, verbose=False, **options)[0]

    detections = []
    for (x1, y1, x2, y2), conf, cls in zip(
        result.boxes.xyxyn.tolist(), result.boxes.conf.tolist(), result.boxes.cls.tolist()
    ):
        name = result.names[int(cls)]
        detections.append(Detection(
            class_label=class_map[name] if class_map else label(name),
            confidence=round(conf, 4),
            x_min=round(x1, 4),
            y_min=round(y1, 4),
            width=round(x2 - x1, 4),
            height=round(y2 - y1, 4),
        ))
    return sorted(detections, key=lambda d: d.confidence, reverse=True)


def _stub_detect(image: bytes) -> list[Detection]:
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


def _configured() -> str | None:
    """LIZARD_MODEL, else the name in models/active.txt."""
    active_file = MODELS_DIR / "active.txt"
    name = os.getenv("LIZARD_MODEL") or (active_file.read_text() if active_file.exists() else "")
    return name.strip() or None


# A configured model that doesn't exist is an error, not a silent switch to fake detections
_active = load_model(_configured()) if _configured() else STUB
if _active is STUB:
    log.warning("No lizard model configured (LIZARD_MODEL or %s); using stub detections.", MODELS_DIR / "active.txt")
