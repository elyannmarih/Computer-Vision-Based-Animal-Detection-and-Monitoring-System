"""Detectra's multiclass YOLO detector, shared by uploads and camera scans.

The bundled model is selected by models/active.txt. Local configuration may
override it; unavailable weights fail explicitly instead of producing fake results.
Species preferences filter the supported classes without changing the weights.
"""
import json
import logging
import os
import shutil
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
SELECTED_FILE = MODELS_DIR / "selected.txt"  # the model last picked in the app (not in git)
CONFIDENCE = float(os.getenv("LIZARD_CONFIDENCE", "0.25"))
CLASSES_FILE = MODELS_DIR / "selected-classes.json"
try:
    _selected_classes = json.loads(CLASSES_FILE.read_text()) if CLASSES_FILE.exists() else {}
    if not isinstance(_selected_classes, dict):
        _selected_classes = {}
except (OSError, ValueError):
    _selected_classes = {}
_selection_lock = threading.Lock()


def selected_classes(model):
    saved = _selected_classes.get(model.version)
    if not isinstance(saved, list) or not all(c in model.classes for c in saved):
        return model.classes
    return list(saved)


def select_classes(version: str, classes: list[str]):
    with _selection_lock:
        model = active()
        if version != model.version:
            raise ValueError("The active model changed; reload the selection")
        if len(set(classes)) != len(classes) or not set(classes).issubset(model.classes):
            raise ValueError("Choose supported classes without duplicates")
        updated = {**_selected_classes, version: sorted(classes)}
        temporary = CLASSES_FILE.with_suffix(".tmp")
        temporary.write_text(json.dumps(updated, indent=2) + "\n")
        temporary.replace(CLASSES_FILE)
        _selected_classes.update(updated)
        return model


@dataclass(frozen=True)
class Model:
    version: str  # folder name under models/
    precision: float | None = None  # only populated when its evaluation scope is known
    info: dict = field(default_factory=dict, compare=False)  # everything in model.json
    weights: Path | None = None

    @property
    def title(self) -> str:
        """The model's display name."""
        return self.info.get("title") or self.version

    @property
    def classes(self) -> list[str]:
        """The labels this model reports."""
        if "class_map" in self.info:
            return sorted(set(self.info["class_map"].values()))
        return sorted({label(n) for n in self.info.get("classes", {}).values()}) if self.weights else [TARGET_LABEL]


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
    """Every model under models/, by title."""
    models = [load_model(p.parent.name) for p in MODELS_DIR.glob("*/model.pt")]
    return sorted(models, key=lambda m: (m.title.lower(), m.version))


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


def use_model(version: str, remember: bool = False) -> Model:
    """Make `version` the model used by later `detect` calls (requests already running keep theirs).

    remember=True also saves the choice in models/selected.txt, so it's used after a restart.
    """
    global _active
    model = load_model(version)
    _yolo(model)  # load now so a bad weights file fails here, not on the next upload
    _active = model
    if remember:
        SELECTED_FILE.write_text(version + "\n")
    return model


def weights_path(path: Path) -> str:
    """A weights path Ultralytics can open.

    Ultralytics strips apostrophes before opening the file, so a folder such as
    Master's Degree is looked up as Masters Degree and the load fails.
    """
    text = str(path)
    if "'" not in text:
        return text
    safe = Path(os.environ.get("LOCALAPPDATA") or os.environ.get("TEMP") or ".") / "detectra-weights" / path.parent.name / path.name
    safe.parent.mkdir(parents=True, exist_ok=True)
    if not safe.exists() or safe.stat().st_size != path.stat().st_size:
        safe.unlink(missing_ok=True)
        try:
            os.link(path, safe)
        except OSError:
            shutil.copy2(path, safe)
    return str(safe)


def _yolo(model: Model):
    with _lock:
        if model.weights not in _loaded:
            from ultralytics import YOLO

            _loaded[model.weights] = YOLO(weights_path(model.weights))
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
        raise ValueError("Detection requires real model weights")

    # Browsers apply EXIF rotation when showing the image, so boxes must be in that orientation too
    return _predict(ImageOps.exif_transpose(Image.open(BytesIO(image))).convert("RGB"), model)


def detect_frame(frame, model: Model | None = None) -> list[Detection]:
    """Run `model` (default: the active one) on a video frame, a BGR numpy array as OpenCV reads it."""
    model = model or _active
    if model.weights is None:
        raise ValueError("Detection requires real model weights")
    return _predict(frame, model)


def _predict(picture, model: Model) -> list[Detection]:
    """`picture` is an RGB PIL image or a BGR numpy array (Ultralytics' conventions for each)."""
    yolo = _yolo(model)
    # A model can limit itself to some of its classes and rename them (model.json "class_map",
    # e.g. Open Images' Man/Woman/Boy/Girl -> person). Overlapping boxes are merged across those
    # classes, so one person isn't reported as both "Man" and "Person".
    class_map = model.info.get("class_map")
    selected = set(selected_classes(model))
    class_ids = [i for i, n in yolo.names.items()
                 if (class_map.get(n) if class_map else label(n)) in selected]
    if not class_ids:
        return []
    options = {"classes": class_ids, "agnostic_nms": True} if class_map else {"classes": class_ids}
    with _lock:
        result = yolo.predict(picture, imgsz=640, conf=CONFIDENCE, iou=0.7,
                              max_det=300, verbose=False, **options)[0]

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


def _read(path: Path) -> str | None:
    return (path.read_text().strip() or None) if path.exists() else None


def _startup_model() -> Model:
    """LIZARD_MODEL, else the last model picked in the app (models/selected.txt), else models/active.txt."""
    if name := (os.getenv("LIZARD_MODEL") or "").strip():
        return load_model(name)  # a configured model that doesn't exist is an error, not fake detections
    if name := _read(SELECTED_FILE):
        try:
            return load_model(name)
        except ValueError:
            log.warning("The model picked in the app, %r, no longer exists; using models/active.txt.", name)
    if name := _read(MODELS_DIR / "active.txt"):
        return load_model(name)
    raise ValueError("No detector configured; restore models/active.txt and its model weights")


_active = _startup_model()
