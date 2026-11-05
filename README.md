# Detectra

Detectra is our university project for detecting animals and people in uploaded images and camera footage. Users can review the detections and mark whether they are correct. We use Next.js for the frontend, FastAPI for the backend, PostgreSQL/Neon for the database, and local storage or S3 for images.

## Detection model

We use **one model, `yolov8s-oiv7`**, with the original Ultralytics Open Images weights. The supported categories are bear, bird, cat, deer, dog, fox, lizard, person, raccoon, snake, and squirrel. Users choose which categories to detect in **Settings**. Deselecting all categories turns detection off. Images and camera frames use the same detector, with an input size of 640 and a default confidence threshold of 0.25. Missing weights or configuration cause an error instead of fake detections.

We kept this model after comparing it with an experimental hybrid that also processed smaller image sections. The hybrid found some additional objects, but it also confused classes, merged some boxes incorrectly, and took longer to run on the CPU. **We still need a separate, unused test set before deciding whether the hybrid is a better replacement.**

On the existing validation set of 214 images, the original model detected 22 labeled lizards and missed 39, giving a lizard recall of 36.1%. Its reported precision of 100% applies **only to the classes included in the annotations**. Some predictions were excluded because the images were only partly labeled, so this is not an overall precision score. Both methods missed the two smallest lizards. Neither produced an alarm on the 15 images marked as verified negatives, but this is a small sample that we had already examined.

The results, limitations, file hashes, and hybrid comparison are saved in [`backend/models/yolov8s-oiv7/evaluation.json`](backend/models/yolov8s-oiv7/evaluation.json). We archived the datasets, unused models, and experiment reports outside this repository. They are not needed to run the application.

## Running on Windows

You need Python 3.13, Node.js, and PostgreSQL 16 or later. You can create a local database using the steps below; access to our shared Neon database is not required. Starting the API does not create or reset the database.

1. Copy `backend/.env.example` to `backend/.env` and fill in `DATABASE_URL`. Keep this private file out of Git.
2. From the project root, run:

   ```powershell
   .\backend\run.ps1
   ```

   This script creates a Python environment at `%LOCALAPPDATA%\Detectra\venv`, installs the dependencies, and starts FastAPI at `http://127.0.0.1:8000`. The short environment path avoids Windows path problems with PyTorch. Use `-SetupOnly` to install without starting the API. The API documentation is available at `http://127.0.0.1:8000/docs`.

3. In another terminal, run:

   ```powershell
   cd frontend
   npm ci
   Copy-Item .env.example .env.local
   npm run dev
   ```

   Open `http://localhost:3000`. The pages are `/`, `/upload`, `/camera`, `/results`, `/settings`, and `/how-to-use`. Browser requests go through `/api/detectra/*`. The server-only `API_BASE_URL` variable must point to the backend.

On other operating systems, create a Python virtual environment, install `backend/requirements.txt`, and run `python -m uvicorn app.main:app` from the `backend` directory.

## Database setup and sample data

The [SQL schema](backend/database/schema.sql) reproduces the six tables used by the current API, including their types, defaults, foreign keys, and checks. It adds indexes for image lists and verification lookups. We checked the structure against the existing database using read-only metadata queries; no private records were copied. `primary_account_id` remains a UUID field on `trusted_persons`, as in the existing schema. It does not imply that account management has been implemented.

First, install the backend dependencies without starting the application:

```powershell
.\backend\run.ps1 -SetupOnly
$python = "$env:LOCALAPPDATA/Detectra/venv/Scripts/python.exe"
```

Using a local PostgreSQL administrator connection, create a development role and an empty database. Choose your own local password when prompted:

```powershell
createuser --host=127.0.0.1 --username=postgres --pwprompt detectra_dev
createdb --host=127.0.0.1 --username=postgres --owner=detectra_dev detectra_dev
```

Set `DETECTRA_DEV_DATABASE_URL` in your shell with that role's password, URL-encoded if it contains special characters. The following value is only an example:

```powershell
$env:DETECTRA_DEV_DATABASE_URL = 'postgresql://detectra_dev:replace-me@127.0.0.1:5432/detectra_dev'
& $python backend/init_db.py
& $python backend/seed.py
```

These scripts read only the explicitly exported development URL. They do not read `.env`, fall back to `DATABASE_URL`, or accept remote hosts. Database names must be `detectra_dev` or `detectra_test`, optionally followed by an underscore and a lowercase alphanumeric suffix. Setup requires an empty database; repeating it on a schema created by this script makes no changes. An unrelated existing schema is rejected. There is no reset or delete option.

For a direct SQL installation on an empty local database, use `psql --dbname="$env:DETECTRA_DEV_DATABASE_URL" --set=ON_ERROR_STOP=1 --single-transaction --file=backend/database/schema.sql` instead of `init_db.py`. Unlike the Python helper, `psql` does not enforce the local-host check. Do not point this command at the shared database. The transaction prevents a failed installation from leaving only part of the schema. See the PostgreSQL [CREATE TABLE documentation](https://www.postgresql.org/docs/16/sql-createtable.html) and psycopg [transaction documentation](https://www.psycopg.org/psycopg3/docs/basic/transactions.html).

The [sample records](backend/database/sample_data.json) include one disabled fictional camera, one fictional reviewer, three images, three detections, and examples of correct, incorrect, empty-image, and pending reviews. `seed.py` creates the PNG images locally using geometric shapes and visible **SYNTHETIC DEMO** labels. We do not use third-party photos or personal camera images. Boxes and confidence scores are manually authored examples, not YOLO predictions or evaluation results. The `stub-demo-v1` database record identifies these examples; it does not install a second detector or change the active YOLO model.

Sample IDs are fixed. Running the seed again does not duplicate records, replace existing rows, or reset feedback. It also refuses to overwrite an image with different contents. Database inserts run in one transaction. If a later database operation fails, generated fixture files may remain and can be reused on retry. Use the same API origin when repeating the seed; existing URLs are not rewritten. `--uploads-dir` selects a different local fixture directory and `--api-base-url` sets the API origin used in sample image URLs. The default directory is `backend/uploads/` and the default origin is `http://127.0.0.1:8000`.

To run against this local database without opening a personal camera or using a bucket, set these variables in the backend terminal before starting the API:

```powershell
$env:DATABASE_URL = $env:DETECTRA_DEV_DATABASE_URL
$env:CAMERA_RTSP_URL = ''
$env:S3_BUCKET = ''
.\backend\run.ps1
```

Start the frontend as described above, with `API_BASE_URL=http://127.0.0.1:8000`. Check `http://127.0.0.1:8000/health`, then open these pages:

- `/results?image=50000000-0000-0000-0000-000000000001`: two sample boxes with saved Correct/Incorrect feedback.
- `/results?image=50000000-0000-0000-0000-000000000002`: a reviewed empty-image example.
- `/results?image=50000000-0000-0000-0000-000000000003`: an unreviewed example for trying feedback and refreshing the page.

Use **Demo Reviewer** when trying feedback. The sample camera is disabled and has no real stream. For actual predictions, upload your own permitted test image; this uses the unchanged `yolov8s-oiv7` detector.

## Configuration

- **Camera:** Set `CAMERA_RTSP_URL` in `backend/.env`. Camera credentials are not returned to the browser. **Scan Now** saves the current frame and its detections. Set `CAMERA_SAVE_INTERVAL=0` to disable automatic saves. By default, frames can be saved every 30 seconds when a detection exceeds `CAMERA_SAVE_CONFIDENCE`.
- **Image storage:** If `S3_BUCKET` is empty, images are saved in `backend/uploads/`, which Git ignores. For S3/R2, fill in the example environment variables and provide a public image URL. `PUBLIC_API_URL` must match the backend origin configured in the frontend.
- **Human review:** Saved results can be reviewed per detection or per image using a reviewer listed in `trusted_persons`. The frontend's demo mode is separate from real detection results.
- **Model settings:** `backend/models/active.txt` sets the default model. `LIZARD_MODEL` or a valid local selection can override it; these should not point to archived models. The model-selection API remains available for compatibility. Local category preferences are not committed to Git.
- **Previous results:** Saved records may refer to older model versions. Viewing or reviewing these records does not require keeping the old model weights on the server.

## Tests

After installing the dependencies, run these commands from the project root:

```powershell
$python = "$env:LOCALAPPDATA/Detectra/venv/Scripts/python.exe"
$env:PYTHONPATH = (Resolve-Path backend).Path
& $python -m unittest discover -s backend/tests
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

For browser tests:

```powershell
cd frontend
npx playwright install chromium webkit
npm run test:e2e
```

Playwright uses local test servers on ports 8101 and 3100 with simulated API responses. These tests do not write to the production database. They check uploads, API responses, results, human review, category selection, and Scan Now in desktop/mobile Chromium and WebKit. We still need field testing to check how the system behaves with a physical camera.

The database setup tests also run against real PostgreSQL. Provide a separate local `detectra_test` database and a test role with `CREATEDB` permission, then run:

```powershell
createuser --host=127.0.0.1 --username=postgres --createdb --pwprompt detectra_test
createdb --host=127.0.0.1 --username=postgres --owner=detectra_test detectra_test
$env:DETECTRA_TEST_DATABASE_URL = 'postgresql://detectra_test:replace-me@127.0.0.1:5432/detectra_test'
$env:PYTHONPATH = (Resolve-Path backend).Path
& $python -m unittest discover -s backend/tests/integration -v
```

The suite creates a randomly named test database and removes only that database afterward. Individual tests roll back their changes. It checks schema creation, repeat runs, sample data, foreign keys, numeric checks, response schemas, and preservation of existing records and files. Missing or unsafe test configuration fails the integration suite rather than silently skipping it. Results from executed Phase III checks are recorded in `docs/phase-3-test-results.json`.

## Evaluating the detector

`backend/evaluate.py` runs the application's detector, checks its output format, and calculates true positives, false positives, false negatives, precision, recall, and F1 for each class. It does not start cameras or write to the database. It uses all supported categories at confidence 0.25 without changing saved preferences.

Provide a JSON manifest like the example below. Boxes use normalized `[x, y, width, height]` coordinates, and the annotations must include every object belonging to a supported category:

```json
[{"id":"example-1","path":"images/example.jpg","split":"test",
  "truth":[["dog",[0.1,0.2,0.3,0.4]]],"complete_annotations":true}]
```

For negative images, use `truth: []`, `complete_annotations: true`, and `verified_empty: true`. Relative image paths are resolved from the manifest's directory. Images and boxes must have matching, normalized orientation. Choose a new output filename for each evaluation:

```powershell
& "$env:LOCALAPPDATA/Detectra/venv/Scripts/python.exe" backend/evaluate.py --manifest C:/data/manifest.json --split test --out C:/data/results.json
```

To reproduce the archived validation, use `--allow-partial-annotations`, with `--original-root` and `--data-root` if the image paths have moved. This option counts excluded predictions and labels the results as conditional, not independent. Keep the final test set separate from any data used to adjust the model or its thresholds.

## Repository contents

The repository contains the application code, tests, example configuration, one model with its metadata and evaluation results, this README, and the Next.js development instructions. Private credentials, local preferences, uploaded images, Python environments, training data, and experiment files are excluded.

Our interface design reference is available in [Figma](https://www.figma.com/design/CNNQIPpuNQoz283NL0pyGe/Detectra?node-id=8-2).
