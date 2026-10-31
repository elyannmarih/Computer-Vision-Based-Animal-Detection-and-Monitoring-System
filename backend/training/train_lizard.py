"""Train the Detectra lizard detector (Ultralytics YOLO) on the Roboflow Lizard_detection dataset.

Dataset: https://universe.roboflow.com/uni-of-leicester-l2rzt/lizard_detection (CC BY 4.0)

    python training/train_lizard.py                     # download dataset v2, train yolo11n
    python training/train_lizard.py --model yolo11s.pt --epochs 150
    python training/train_lizard.py --data path/to/data.yaml   # use an already downloaded copy

Downloading needs ROBOFLOW_API_KEY (free account: https://app.roboflow.com/settings/api),
set in the environment or in backend/.env.

Each run saves its best weights and metrics to a new folder, backend/models/<name>/
(model.pt + model.json), named after the base model and start time, e.g. yolo11n-20261024-110930.
The API uses the model named in backend/models/active.txt; pass --activate to switch it to the
new one, or edit that file (or set LIZARD_MODEL) later.
"""
import argparse
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

import yaml
from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
DATASETS = BACKEND / "training" / "datasets"
RUNS = BACKEND / "training" / "runs"
MODELS = BACKEND / "models"

WORKSPACE, PROJECT = "uni-of-leicester-l2rzt", "lizard_detection"


def download(version: int) -> Path:
    """Download the dataset in YOLO format (once) and return its data.yaml."""
    location = DATASETS / f"{PROJECT}-v{version}"
    if not (location / "data.yaml").exists():
        api_key = os.getenv("ROBOFLOW_API_KEY")
        if not api_key:
            raise SystemExit(
                "ROBOFLOW_API_KEY is not set. Add it to backend/.env "
                "(get one at https://app.roboflow.com/settings/api), or pass --data."
            )
        from roboflow import Roboflow

        project = Roboflow(api_key=api_key).workspace(WORKSPACE).project(PROJECT)
        project.version(version).download("yolov8",location=str(location))
    return location / "data.yaml"


def fix_paths(data_yaml: Path) -> Path:
    """Roboflow exports use paths like ../train/images; rewrite them relative to the dataset folder."""
    root = data_yaml.parent
    config = yaml.safe_load(data_yaml.read_text())
    config["path"] = str(root)
    for split, folder in [("train", "train"), ("val", "valid"), ("test", "test")]:
        if (root / folder / "images").is_dir():
            config[split] = f"{folder}/images"
        else:
            config.pop(split, None)
    if "val" not in config:
        raise SystemExit(f"{root} has no valid/ split to validate on.")
    fixed = root / "data.detectra.yaml"
    fixed.write_text(yaml.safe_dump(config, sort_keys=False))
    return fixed


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, help="existing data.yaml (skips the download)")
    parser.add_argument("--version", type=int, default=2, help="Roboflow dataset version (default 2)")
    parser.add_argument("--model", default="yolo11n.pt", help="pretrained weights to start from")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--patience", type=int, default=30, help="stop early after this many epochs without improvement")
    parser.add_argument("--device", default=None, help="e.g. 0 for the first GPU or cpu (default: auto)")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--activate", action="store_true", help="make the new model the one the API uses")
    args = parser.parse_args()

    load_dotenv(BACKEND / ".env")
    from ultralytics import YOLO

    data = fix_paths(args.data.resolve() if args.data else download(args.version))
    has_test = "test" in yaml.safe_load(data.read_text())
    name = f"{Path(args.model).stem}-{datetime.now():%Y%m%d-%H%M%S}"

    model = YOLO(args.model)
    model.train(
        data=str(data),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        patience=args.patience,
        device=args.device,
        workers=args.workers,
        project=str(RUNS),
        name=name,
        seed=0,
    )
    best_path = Path(model.trainer.best)

    # Report on held-out test images when the dataset has them, otherwise on validation
    best = YOLO(best_path)
    split = "test" if has_test else "val"
    metrics = best.val(data=str(data), split=split, imgsz=args.imgsz, device=args.device,
                       project=str(RUNS), name=f"{name}-{split}")

    folder = MODELS / name
    folder.mkdir(parents=True)
    shutil.copy2(best_path, folder / "model.pt")
    info = {
        "version": name,  # unique per run, so each retrain gets its own models row
        "base_model": args.model,
        "dataset": str(args.data) if args.data else f"roboflow:{WORKSPACE}/{PROJECT}/{args.version}",
        "classes": best.names,
        "imgsz": args.imgsz,
        "epochs": args.epochs,
        "eval_split": split,
        "precision": round(float(metrics.box.mp), 4),
        "recall": round(float(metrics.box.mr), 4),
        "map50": round(float(metrics.box.map50), 4),
        "map50_95": round(float(metrics.box.map), 4),
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "run_dir": str(best_path.parents[1].relative_to(BACKEND).as_posix()),
    }
    (folder / "model.json").write_text(json.dumps(info, indent=2) + "\n")
    print(f"\nSaved {folder}\n{json.dumps(info, indent=2)}")
    if args.activate:
        (MODELS / "active.txt").write_text(name + "\n")
        print(f"Activated {name}; restart the API to load it.")
    else:
        print(f"To use it, write {name} to {MODELS / 'active.txt'} (or pass --activate next time).")


if __name__ == "__main__":  # required on Windows, where dataloader workers re-import this file
    main()
