# Detectra backend

FastAPI backend for Detectra, backed by Neon Postgres (cameras, images, detections, models, human verifications, trusted persons).

## Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # then fill in DATABASE_URL (and S3 settings if using a bucket)
```

## Run

```bash
uvicorn app.main:app --reload --timeout-graceful-shutdown 3
```

Interactive docs: http://127.0.0.1:8000/docs

## Test data

```bash
python seed.py          # add test data
python seed.py --reset  # wipe ALL rows in every table, then add test data
```

## Endpoints

**Analysis**

- `POST /analyze` — multipart upload (`image`: JPG/PNG/WEBP up to 10 MB; optional `camera_id`, `captured_at`). Stores the image, runs the detector, saves the image and its detections, and returns them.
- `POST /detections/{detection_id}/verify` — `{"verified_by_id": "<trusted person id>", "verdict": "correct" | "incorrect"}`. Records the verdict and updates the image's `human_verified` (true once every detection is reviewed) and `number_targets_verified`.
- `POST /images/{image_id}/verify` — one verdict for a whole image (e.g. confirming "no lizard").

**Live cameras** (see [Live camera](#live-camera))

- `GET /live` — cameras being streamed: connection state, resolution, analysis frame rate, model, and the detections on the latest frame.
- `GET /live/{camera_id}` — one camera's status.
- `GET /live/{camera_id}/video` — the analyzed stream with detections drawn on, as MJPEG (use it as an `<img>` src).
- `POST /live/{camera_id}/scan` — save the current frame and its detections, like an upload; returns the same result as `/analyze`.

**Tables** — each has `GET` (with filters + `limit`/`offset`), `GET /{id}`, `POST`, `PATCH /{id}`, `DELETE /{id}`:

`/cameras`, `/models`, `/trusted-persons`, `/human-verifications`, `/images`, `/detections`

`GET /health` checks the database connection and reports the storage mode.

Database constraint violations (bad foreign key, NOT NULL, CHECK) return `409` with Postgres's message.

## Detector

`app/detector.py` runs an Ultralytics YOLO model and keeps boxes scoring at least `LIZARD_CONFIDENCE` (default 0.25). Every detection counts as a target (`detector.is_target`), people included.

Each model has its own folder, and the folder name is the version recorded in the `models` table:

```
models/
  active.txt                     # name of the model the API uses
  yolo11n-20261024-110930/       # model.pt (weights) + model.json (settings, test metrics)
  yolo11s-20261024-122450/
  yolov8s-oiv7/
```

| Model | Detects | Size |
|---|---|---|
| `yolo11n-20261024-110930` (active) | lizard: trained on the [Roboflow Lizard_detection dataset](https://universe.roboflow.com/uni-of-leicester-l2rzt/lizard_detection) (Uni of Leicester, CC BY 4.0) | 5.5 MB |
| `yolo11s-20261024-122450` | lizard: same data, larger model | 19 MB |
| `yolov8s-oiv7` | bear, bird, cat, deer, dog, fox, lizard, person, raccoon, snake, squirrel: Ultralytics' Open Images V7 model, not fine-tuned | 23 MB |

Lizard results on the dataset's 54 test images, matching boxes at IoU 0.5 with the API's 0.25 threshold:

| Model | Precision | Recall | F1 |
|---|---|---|---|
| `yolo11n-20261024-110930` | 0.65 | 0.70 | 0.67 |
| `yolo11s-20261024-122450` | 0.58 | 0.73 | 0.65 |
| `yolov8s-oiv7` | 0.95 | 0.38 | 0.54 |

So the Open Images model rarely calls something a lizard wrongly, but misses most lizards (in 20 of the 54 images it finds nothing). There's no labelled data here for its other classes, so those haven't been scored. A model's `model.json` can carry a `class_map` that limits it to some of its classes and renames them (Open Images' Man/Woman/Boy/Girl become `person`, Owl/Duck/Eagle/… become `bird`). Overlapping boxes are merged across those classes.

To switch models, write another folder name to `models/active.txt` (or set `LIZARD_MODEL`) and restart the API; a name that doesn't exist stops the API from starting. In code, `detector.available_models()` lists them and `detector.use_model(name)` switches without a restart. With no model configured the detector falls back to the old **stub** (deterministic fake detections, model version `stub-0.1`) and logs a warning.

### Training

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126   # NVIDIA GPU; skip for CPU
pip install -r training/requirements.txt
# add ROBOFLOW_API_KEY to .env (free: https://app.roboflow.com/settings/api)
python training/train_lizard.py
```

The script downloads the dataset to `training/datasets/`, fine-tunes `yolo11n.pt` (`--model yolo11s.pt` for a larger model; `--epochs`, `--imgsz`, `--batch`, `--device` are also available), evaluates on the test split, and saves the best weights and metrics to a new `models/<base model>-<date>-<time>/` folder. It doesn't change the active model unless you pass `--activate`. Run outputs (curves, confusion matrix, sample predictions) are in `training/runs/`.

`python training/add_pretrained.py --weights yolov8s-oiv7.pt` downloads an Open Images model (`yolov8n/s/m/l/x-oiv7.pt`), applies the class map in that script, saves it to `models/<name>/`, and scores it on the lizard test images (`--compare <folder> ...` scores other models the same way).

## Live camera

Set `CAMERA_RTSP_URL` in `.env` (credentials included) and restart the API. `app/camera.py` then:

- finds or creates the camera's `cameras` row by its URL **without** credentials, so the password stays in `.env` and never reaches the database or the API. A disabled row isn't streamed;
- reads the stream over TCP in one thread, keeping only the newest frame, and runs the active model on each frame in another, so analysis never falls behind the live picture. It reconnects on its own if the stream drops;
- serves the annotated frames at `/live/{camera_id}/video`, scaled to 1280 px wide to keep the stream light;
- saves full-size frames that have a detection at least `CAMERA_SAVE_CONFIDENCE` confident (default 0.5), with their detections, like uploads (`images.camera_id` set), at most once every `CAMERA_SAVE_INTERVAL` seconds (default 30; 0 turns this off). The live view shows weaker detections too, down to `LIZARD_CONFIDENCE`. `POST /live/{camera_id}/scan` saves the current frame on demand.

A video file path also works as `CAMERA_RTSP_URL`; it plays at its own frame rate, which is handy for testing without the camera. The open video stream keeps a connection open, so `--timeout-graceful-shutdown` stops `--reload` from waiting on it.

## Image storage

- **Local (default):** with `S3_BUCKET` empty, images are saved to `backend/uploads/` (git-ignored) and served at `/uploads/...`.
- **S3-compatible bucket:** set `S3_BUCKET`, `S3_PUBLIC_BASE_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, plus `S3_ENDPOINT_URL` / `S3_REGION` for non-AWS providers such as Cloudflare R2. Objects must be publicly readable at `S3_PUBLIC_BASE_URL`.

## CORS

`CORS_ORIGINS` (comma-separated) lists the frontend origins allowed to call the API; defaults to `http://localhost:3000`.

## Layout

- `app/db.py` — connection pool (psycopg 3), one transaction per request
- `app/schemas.py` — Pydantic request/response models matching the tables
- `app/crud.py` — generic CRUD router factory
- `app/analysis.py` — `/analyze`, `record()` (saves an analyzed image and its detections) and per-detection verification
- `app/camera.py` — live RTSP cameras: per-frame detection, MJPEG stream, saving frames
- `app/detector.py` — YOLO detector, model selection (stub fallback)
- `training/train_lizard.py` — downloads the lizard dataset and trains a detector
- `training/add_pretrained.py` — adds an Open Images multi-animal model
- `app/storage.py` — S3 or local image storage
- `app/main.py` — app setup, routers, whole-image verify
