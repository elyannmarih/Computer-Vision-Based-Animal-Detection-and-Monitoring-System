"""Add an Ultralytics pretrained model (no fine-tuning) as a Detectra model, limited to some classes.

    python training/add_pretrained.py                          # yolov8m-oiv7, animals in CLASS_MAP
    python training/add_pretrained.py --weights yolov8s-oiv7.pt --activate
    python training/add_pretrained.py --weights yolo11s.pt --classes dog --name dog-yolo11s --title Dogs
    python training/add_pretrained.py --compare yolo11n-20261024-110930   # also score another model

Without --classes the model is limited to the classes in CLASS_MAP, which also folds Open Images'
sub-classes into the labels Detectra stores (Man/Woman/Boy/Girl -> person, Brown bear -> bear,
Owl -> bird, ...). With --classes it keeps just those (COCO weights know 80 classes, including
person, dog, cat, bird, horse, sheep, cow and bear). It's saved to backend/models/<name>/ like
trained models; models that detect lizards are scored on the lizard dataset's test images (the
only labelled data here), for the lizard class only.
"""
import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
PRETRAINED = BACKEND / "training" / "pretrained"
LIZARD_TEST = BACKEND / "training" / "datasets" / "lizard_detection-v2" / "test"

BIRDS = ["Bird", "Blue jay", "Canary", "Chicken", "Duck", "Eagle", "Falcon", "Goose", "Magpie", "Ostrich",
         "Owl", "Parrot", "Penguin", "Raven", "Sparrow", "Swan", "Turkey", "Woodpecker"]
CLASS_MAP = {
    "Bear": "bear", "Brown bear": "bear", "Polar bear": "bear",
    "Dog": "dog",
    "Deer": "deer",
    "Person": "person", "Man": "person", "Woman": "person", "Boy": "person", "Girl": "person",
    "Lizard": "lizard",
    "Fox": "fox",
    "Raccoon": "raccoon",
    "Squirrel": "squirrel",
    "Cat": "cat",
    "Snake": "snake",
    **{name: "bird" for name in BIRDS},
}


def iou(a, b):
    """Boxes as (x_min, y_min, width, height), normalized."""
    ix = max(0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    inter = ix * iy
    return inter / (a[2] * a[3] + b[2] * b[3] - inter or 1)


def score_lizards(model) -> dict:
    """Precision/recall of `lizard` detections at IoU 0.5 and the API's confidence threshold."""
    from app import detector

    tp = fp = fn = 0
    for image in sorted((LIZARD_TEST / "images").iterdir()):
        truth = []
        for line in (LIZARD_TEST / "labels" / f"{image.stem}.txt").read_text().split("\n"):
            if line.strip():
                _, cx, cy, w, h = map(float, line.split()[:5])
                truth.append((cx - w / 2, cy - h / 2, w, h))
        found = [d for d in detector.detect(image.read_bytes(), model) if d.class_label == "lizard"]
        for d in found:  # highest confidence first; each true box can be matched once
            box = (d.x_min, d.y_min, d.width, d.height)
            best = max(truth, key=lambda t: iou(box, t), default=None)
            if best is not None and iou(box, best) >= 0.5:
                truth.remove(best)
                tp += 1
            else:
                fp += 1
        fn += len(truth)
    precision, recall = tp / (tp + fp or 1), tp / (tp + fn or 1)
    return {"precision": round(precision, 4), "recall": round(recall, 4),
            "f1": round(2 * precision * recall / (precision + recall or 1), 4), "tp": tp, "fp": fp, "fn": fn}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--weights", default="yolov8m-oiv7.pt",
                        help="Ultralytics pretrained weights: Open Images (*-oiv7.pt) or COCO (yolo11n.pt, yolo11s.pt, ...)")
    parser.add_argument("--classes", nargs="+",
                        help="keep only these classes of the weights, e.g. --classes dog (default: the animal CLASS_MAP)")
    parser.add_argument("--name", help="model folder name (default: the weights name)")
    parser.add_argument("--title", help="name shown in the app's model picker")
    parser.add_argument("--activate", action="store_true", help="make it the model the API uses")
    parser.add_argument("--compare", nargs="*", default=[], help="other models/ folders to score the same way")
    args = parser.parse_args()

    from ultralytics.utils.downloads import attempt_download_asset

    PRETRAINED.mkdir(parents=True, exist_ok=True)
    weights = Path(attempt_download_asset(str(PRETRAINED / args.weights)))
    from ultralytics import YOLO

    class_map = {c: c.lower() for c in args.classes} if args.classes else CLASS_MAP
    missing = set(class_map) - set(YOLO(weights).names.values())
    if missing:
        raise SystemExit(f"{args.weights} has no classes named {sorted(missing)}.")
    name = args.name or weights.stem
    labels = sorted(set(class_map.values()))
    folder = BACKEND / "models" / name
    folder.mkdir(parents=True, exist_ok=True)
    shutil.copy2(weights, folder / "model.pt")
    info = {
        "version": name,
        "title": args.title or ", ".join(label.capitalize() for label in labels),
        "base_model": args.weights,
        "dataset": ("Open Images V7" if "oiv7" in args.weights else "COCO") + " (pretrained by Ultralytics, not fine-tuned)",
        "classes": labels,
        "class_map": class_map,
        "added_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (folder / "model.json").write_text(json.dumps(info, indent=2) + "\n")

    from app import detector

    if "lizard" not in labels:
        print(f"{name} doesn't detect lizards; skipped scoring on the lizard test set.")
    elif LIZARD_TEST.is_dir():
        info["eval_split"] = "lizard_detection test, lizard class only (IoU 0.5)"
        lizard = score_lizards(detector.load_model(name))
        info["precision"], info["recall"] = lizard["precision"], lizard["recall"]
        info["lizard_eval"] = lizard
        (folder / "model.json").write_text(json.dumps(info, indent=2) + "\n")
        print(f"{name}: {lizard}")
    else:
        print(f"No lizard test set at {LIZARD_TEST} (run train_lizard.py to download it); skipped scoring.")
    for other in args.compare:
        print(f"{other}: {score_lizards(detector.load_model(other))}")

    print(f"\nSaved {folder}")
    if args.activate:
        (BACKEND / "models" / "active.txt").write_text(name + "\n")
        print(f"Activated {name}; restart the API to load it.")


if __name__ == "__main__":
    main()
