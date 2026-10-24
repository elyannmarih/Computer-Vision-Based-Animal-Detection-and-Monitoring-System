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
uvicorn app.main:app --reload
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

**Tables** — each has `GET` (with filters + `limit`/`offset`), `GET /{id}`, `POST`, `PATCH /{id}`, `DELETE /{id}`:

`/cameras`, `/models`, `/trusted-persons`, `/human-verifications`, `/images`, `/detections`

`GET /health` checks the database connection and reports the storage mode.

Database constraint violations (bad foreign key, NOT NULL, CHECK) return `409` with Postgres's message.

## Detector

`app/detector.py` is a **stub**: it returns deterministic fake lizard detections (the same image always gives the same result) and records them under model version `stub-0.1`. Replace the body of `detect()` with real inference and bump `MODEL_VERSION`; nothing else needs to change.

## Image storage

- **Local (default):** with `S3_BUCKET` empty, images are saved to `backend/uploads/` (git-ignored) and served at `/uploads/...`.
- **S3-compatible bucket:** set `S3_BUCKET`, `S3_PUBLIC_BASE_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, plus `S3_ENDPOINT_URL` / `S3_REGION` for non-AWS providers such as Cloudflare R2. Objects must be publicly readable at `S3_PUBLIC_BASE_URL`.

## CORS

`CORS_ORIGINS` (comma-separated) lists the frontend origins allowed to call the API; defaults to `http://localhost:3000`.

## Layout

- `app/db.py` — connection pool (psycopg 3), one transaction per request
- `app/schemas.py` — Pydantic request/response models matching the tables
- `app/crud.py` — generic CRUD router factory
- `app/analysis.py` — `/analyze` and per-detection verification
- `app/detector.py` — detector (stub)
- `app/storage.py` — S3 or local image storage
- `app/main.py` — app setup, routers, whole-image verify
