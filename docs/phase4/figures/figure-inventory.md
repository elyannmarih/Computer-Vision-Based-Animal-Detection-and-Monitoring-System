# Phase IV figure inventory

Prepared on November 20, 2026; physical-camera evidence added from November 21. Source inspection and local execution used `main` at `4bb91fbb5d0576a4e5e9fb593ea61205673f66c1`. Historical CI evidence belongs to merge commit `693ca02fb22cc0c15f0d2f2983b79ce596d79a77`, not to the later figure commit.

We reviewed the existing [Phase IV report](https://docs.google.com/document/d/1zmjnJn7Zm5gC_B7G-h7NqVVIq3L8u8iyc-V0IuEnToU/edit), including its figure locations and document styles. The initial figure delivery left the document unchanged. Following authorization on November 20, the figures and explanatory results were incorporated into that report while preserving Phases I and II. Figures 3, 4, and 6 were reconstructed from source; their `.mmd` files are the editable Mermaid sources. SVG and PNG exports were generated directly from those sources with Mermaid CLI 12.2.0. They use Times New Roman, white backgrounds, and the requested blue palette. PNG exports preserve aspect ratio with a maximum dimension of 3200 pixels. Figure 4 was subsequently condensed to improve report-page legibility, grouping model and image-storage operations within the FastAPI participant without changing their order.

All paths below are relative to the repository root. Figure links resolve within this directory.

## Figure 1 — Detection Results Screen

- **File/type:** [figure-01-detection-results.png](figure-01-detection-results.png); authentic application screenshot, 1356 × 1260 px.
- **Sources:** `frontend/src/app/results/results-view.tsx`, `frontend/src/lib/detection-service.ts`, `frontend/src/lib/backend-server.ts`, `backend/app/analysis.py`, and `backend/app/detector.py`.
- **Caption:** Detection results from the running application show a genuine lizard prediction from `yolov8s-oiv7`, its bounding box, a 74.4% confidence score (stored value: 0.7435), and the available verification controls.
- **Verification:** An unchanged public-domain photograph of a green anole was analyzed through the running Next.js `/api/detectra/analyze` route, FastAPI, and YOLO. The browser displayed the resulting saved image record; the box and score were rendered by the application.
- **Capture method:** An isolated Docker Compose project used a fresh database and local storage. Because browser file selection was unavailable, a multipart HTTP client submitted the original photograph to the actual Next.js route. The resulting URL was then opened in the browser. We selected the existing Demo Reviewer record and revealed the detection before capturing the page. The upload-button interaction itself was not captured or demonstrated in this session.
- **Limitations/provenance:** This is a single positive workflow example, not an accuracy benchmark. The photograph is credited to Grayson Smith/USFWS (March 1, 2019) and labeled Public Domain on the [USFWS source page](https://www.fws.gov/media/green-anole-0). The [original JPEG](https://www.fws.gov/sites/default/files/images/2019-03/32782.jpg), 1888 × 1889 px, was submitted without cropping or enhancement. SHA-256: `7d428103991aab5d077ac4c2b36a0b29653d35cf6bf40a513ffa53b41120ebbb`. Model weights, thresholds, predictions, and application code were unchanged. The NASA person fixture also demonstrates the multiclass workflow in Figure 1c.

### Supplementary Figure 1b — Distant Lizard: Missed Detection

- **File/type:** [figure-01b-distant-lizard-no-detection.png](figure-01b-distant-lizard-no-detection.png), 1040 × 796 px. Authentic application screenshot crop; this supplements Figure 1 without renumbering Figures 2–7.
- **Caption:** A user-supplied photograph contains a visible small lizard near a shaded building corner, but the unchanged detector returns no candidates. This case illustrates a missed detection under the tested conditions.
- **Sources and authorization:** The project owner supplied `WhatsApp Image 2026-11-20 at 4.25.23 PM.jpeg` and authorized its publication as project evidence; no public-domain license is asserted. At the owner's request, only this farther view is retained in the figures and report. The similar second view, `WhatsApp Image 2026-11-20 at 4.25.24 PM.jpeg`, was omitted from the current figure delivery to avoid redundant illustrations.
- **Method:** Each complete 1536 × 2048 image was submitted once through the same local Next.js analysis endpoint, with `yolov8s-oiv7`, confidence threshold 0.25, and the existing inference settings. Neither image was cropped, enhanced, used for training, or used to change settings before inference. The final screenshot crops remove surrounding navigation and retain the visible animal and the application's unchanged zero-detection result.
- **Recorded evidence:** Figure 1b image ID `853bf1be-ae1b-458b-a83c-8caf7844c471`, input SHA-256 `85d40a62d9d76992b0d9bfc7e1aa52aece7e02b26201ed2b3b5337c16a9193d6`; omitted second-view image ID `949e52f1-2200-4beb-af30-54bb05ffa865`, input SHA-256 `edcf5dde5256578dfe42b168e5c660a9d5a795f561d4f38753c6ed2ea5c1de41`. Both original API responses reported `simulated=false`, `modelVersion=yolov8s-oiv7`, and `detections=[]`. PostgreSQL independently confirmed zero detection records for each image. No review was submitted for these two results. Omitting the redundant illustration does not change this historical test record.
- **Replacement capture:** On November 20, the existing Figure 1b result was reopened and captured again. The cursor was moved outside the result panel before capture; the panel was cropped from that new screenshot. No inference, review submission, image enhancement, or result modification was performed.
- **Interpretation and limits:** These are two qualitative false-negative examples, not a representative sample or a measured accuracy rate. The animal occupies a small area and lies in shadow; scale, contrast, image compression, and model coverage are possible influences, but the experiment does not isolate a cause. Two views of a similar scene are not independent evidence of general performance. When reloading an empty result, the UI says the model was not recorded because no detection-linked model record is available; the original analysis response identifies the actual model used. The later physical RTSP preview and Scan Now check is documented in Figure 1d; it does not change these photograph results.


### Supplementary Figure 1c — Person Detection

- **File/type:** [figure-01c-person-detection.jpg](figure-01c-person-detection.jpg), 1040 × 724 px; authentic application screenshot crop. Renumbered from Figure 1d after removal of the redundant lizard illustration.
- **Input:** `backend/tests/fixtures/astronaut.png`, the public-domain NASA astronaut portrait distributed with [scikit-image 0.25.2](https://scikit-image.org/docs/0.25.x/api/skimage.data.html#skimage.data.astronaut). SHA-256: `88431cd9653ccd539741b555fb0a46b61558b301d4110412b5bc28b5e3ea6cb5`.
- **Method/result:** The same actual Next.js analysis route and unchanged `yolov8s-oiv7` model returned one `person` prediction, confidence `0.5337` (UI: 53.4%), `simulated=false`. The saved result was opened in the browser before this capture. Image `020e6dea-00fd-42be-870e-77e2037c6608`; detection `f294ad2a-fe94-4b80-8f8f-215d0602f329`.
- **Verification:** A subsequent Correct verdict was submitted through the interface. Reload and PostgreSQL checks confirmed persisted review `d19fba9e-4f2f-4d90-99bb-45d10edcee29`, `human_verified=true`, one confirmed target, and unchanged confidence. The replacement screenshot shows this already saved verdict after reload. The cursor was moved outside the result panel before recapture and panel cropping; no new inference or review was submitted.
- **Limitations:** One person example demonstrates the broader category workflow, not overall person-detection accuracy. Category detection does not identify a person or authenticate a reviewer. These images were not used for training or tuning.

### Supplementary Figure 1d — Physical-Camera Scan Now

- **File/type:** [figure-01d-physical-camera-scan.png](figure-01d-physical-camera-scan.png), 562 × 713 px; authentic screenshot crop from the saved result page, matching the Google Docs figure. The crop retains the camera frame and zero-detection result without changing their pixels or adding labels.
- **Caption:** Figure 1d. Physical-camera Scan Now test (November 21, 2026). The interface saved a real RTSP frame with zero detections; the result remained available after reload. No people or animals were visible. This confirms the capture and save workflow, not detection accuracy or continuous-operation reliability.
- **Method/result:** A physical RTSP camera supplied 2880 × 1620 video to the local Docker Compose stack. The unchanged `yolov8s-oiv7` model analyzed live frames; sampled analysis rates were approximately 5–6 fps. We clicked **Scan Now** in the browser, reached the saved result, and reloaded it successfully. Automatic saves remained disabled. No model training, threshold changes, or human-review submission were performed.
- **Recorded evidence:** Camera ID `a2105a18-2c10-4726-bb99-ba5e18eb6a6a`; UI-created image ID `7b639dc1-6381-44c5-8308-ac4df0d82c1e`; displayed result `0 detections` / `Nothing detected`. An earlier API scan also saved and reloaded image `30c77658-03ea-451c-a405-3e145ad82228`, with `simulated=false`, `modelVersion=yolov8s-oiv7`, and `detections=[]`. The figure shows the subsequent browser-button test, not that earlier API scan.
- **Scope and permission:** The project owner authorized this camera screenshot for the report and GitHub. Camera credentials and network addresses are not included. This was a scene without visible targets; person/animal detection through the physical camera, varied conditions, reconnection, automatic saving, and prolonged availability were not validated. Saved empty-result pages still lack the model label on reload because of the existing schema limitation.

### Supplementary Figure 1e — Physical-Camera Person Detection and Automatic Save

- **File/type:** [figure-01e-physical-camera-person-autosave.png](figure-01e-physical-camera-person-autosave.png), 1575 × 931 px; result-panel crop from the owner's `Screenshot 2026-11-22 112436.png`, with the person and detection box visible. Only surrounding browser/navigation content was removed; result pixels and values are unchanged. The owner authorized inclusion in GitHub and Google Docs.
- **Caption:** Figure 1e. Physical-camera person detection (November 22, 2026). The camera detected a person at 51.1% confidence, and the system automatically saved the frame. The screenshot shows the saved result with the detection revealed.
- **Recorded evidence:** Saved camera image `ddf577ef-9c51-4905-8b39-1c8b485c876a`; detection `191a6e8b-f8c8-4633-9c50-7fc61d8279c5`; model `yolov8s-oiv7`; `simulated=false`; class `person`; stored confidence `0.5113` (displayed as 51.1%). The saved result was retrieved through the application API. Automatic saving was configured with a 30-second interval and confidence threshold 0.5; the owner reported the automatic capture during this test. This is a subsequent positive example, separate from the November 21 zero-detection Scan Now test in Figure 1d. It is not an estimate of overall detection accuracy or prolonged reliability.

## Figure 2 — Human Verification Interface

- **File/type:** [figure-02-human-verification.png](figure-02-human-verification.png); two authentic application screenshot crops, 740 × 234 px. Only the before/after panels are included; the figure title and explanation are editable text in Google Docs.
- **Sources:** `frontend/src/app/results/results-view.tsx`, `frontend/src/app/api/detectra/verify/route.ts`, `frontend/src/lib/backend-server.ts`, `backend/app/analysis.py`, `backend/app/verification.py`, `backend/app/db.py`, and `backend/database/schema.sql`.
- **Caption:** Figure 2. Human Verification Interface. Left: lizard verification before submitting feedback. Right: the saved Correct verdict after reload. The authentic interface crops retain the same 74.4% confidence. Database checks confirmed persistence; the reviewer selector is not authentication.
- **Verification/capture method:** For the Figure 1 result, we selected Demo Reviewer, revealed the box, captured the Correct/Incorrect controls, and clicked Correct. We reloaded the browser, selected the reviewer again, and revealed the same detection. The saved-state screenshot and a database query confirmed the linked review. At the owner's request, the composite was cropped to retain only the unchanged before/after control panels, removing the reviewer panel and all added title/panel labels. The original panel pixels and results are unchanged; no new inference or review was submitted.
- **Recorded evidence:** Image `92483c3a-9235-47d7-9435-9beeb55c574c`; detection `dba934cd-80d2-416b-9049-3a2270163bbf`; persisted review `d283ffa0-3ea2-4cbe-ac40-90d4499f0902`. PostgreSQL reported `human_verified=true`, one detection, one confirmed target, `target_found=true`, and unchanged confidence `0.7435`. Demo Reviewer is a fictional identity taken from the repository sample data and created through the normal reviewer API; image, detection, and review records were produced by the actual workflows.
- **Limitations:** The reviewer selector is not authentication. Repeated detection-verification API requests insert a new review and replace the detection's review link, but the current results screen removes the decision buttons after saving and offers no revision button. This figure demonstrates one initial Correct verdict and its persistence.

## Figure 3 — Final System Architecture

- **Files/type:** [PNG](figure-03-system-architecture.png), 2188 × 3200 px; [Mermaid source](figure-03-system-architecture.mmd); [SVG export](figure-03-system-architecture.svg); architecture diagram.
- **Sources:** `frontend/src/app/api/detectra/`, `frontend/src/lib/backend-server.ts`, `frontend/src/lib/detection-service.ts`; `backend/app/main.py`, `analysis.py`, `detector.py`, `detector_routes.py`, `camera.py`, `storage.py`, `db.py`, `crud.py`, `verification.py`; `backend/database/schema.sql`; and `compose.yaml`.
- **Caption:** Implemented local client–server architecture. Next.js mediates browser requests to FastAPI; backend modules perform inference, camera processing, image storage, and PostgreSQL persistence. S3 is an optional backend capability.
- **Verification:** Request routes, module calls, storage selection, database relationships, camera flow, and Compose exposure were traced in source. Boxes inside FastAPI are modules within the same backend, not independently deployed microservices.
- **Supported patterns:** Layered client–server organization; API adaptation and response validation in `backend-server.ts`; separation of inference, persistence, and workflow responsibilities; FastAPI dependency injection for database connections; and shared workflow composition through `analysis.record()` for uploads and camera saves. These do not establish formal Factory, Observer, or Singleton patterns.
- **Limitations:** Default storage is local. Although `storage.py` supports S3, the current Next.js response adapter accepts backend-local image URLs, so S3 is not an end-to-end validated frontend integration. A single RTSP source is configurable. Physical preview and manual Scan Now storage/reload were verified on November 21 (Figure 1d); field accuracy and sustained operation remain unvalidated. Automated camera evidence uses generated local video. No public hosting or production authentication is implied.

## Figure 4 — Image Analysis and Human Verification Sequence

- **Files/type:** [PNG](figure-04-analysis-verification-sequence.png), 2507 × 3200 px; [Mermaid source](figure-04-analysis-verification-sequence.mmd); [SVG export](figure-04-analysis-verification-sequence.svg); UML-style sequence diagram.
- **Sources:** `frontend/src/app/upload/page.tsx`, `frontend/src/app/api/detectra/analyze/route.ts`, `frontend/src/app/api/detectra/verify/route.ts`, `frontend/src/lib/backend-server.ts`, `frontend/src/lib/detection-service.ts`; `backend/app/analysis.py`, `detector.py`, `storage.py`, `verification.py`, `crud.py`, and `db.py`.
- **Caption:** Ordered requests and returns for image validation, YOLO inference, file and database persistence, result display, and individual human verification. Notes describe empty results, repeat API verification, and failure handling.
- **Verification:** Source tracing confirmed multipart upload, the 10 MiB limit, inference before `record()`, storage before database insertion, explicit analysis commit, response mapping, parent/detection locking, new review insertion, link replacement, aggregate updates, and reconstruction on reload. The browser participant includes user interaction; dashed arrows denote returns.
- **Limitations:** The main sequence illustrates the implemented upload UI path, whereas Figure 1's capture used the HTTP submission described above. Model and file-storage calls are grouped as ordered internal FastAPI operations; Figure 3 retains their separate module boundaries. Exceptional paths are summarized in notes rather than expanded into additional lifelines. No-detection verification records an image-level verdict without inventing a detection. Known failed writes trigger rollback and file compensation; uncertain commits retain the file. Review revision is an API capability, not an exposed results-screen action.

## Figure 5 — Automated Testing Evidence

- **File/type:** [figure-05-github-actions-testing.png](figure-05-github-actions-testing.png); genuine GitHub Actions screenshot crop, 1537 × 443 px.
- **Source:** [Workflow run 44164413412](https://github.com/elyannmarih/Computer-Vision-Based-Animal-Detection-and-Monitoring-System/actions/runs/44164413412).
- **Caption:** Successful Phase III workflow on `main` at merge commit `693ca02`, showing the Application checks and Docker delivery jobs.
- **Verification:** The actual browser page, workflow job records, and job logs were inspected. Logs confirmed 47 Python unit tests, 22 PostgreSQL/YOLO integration tests, 109 browser regression tests, five full-system browser tests, eight source-stack checks, eight restored-stack checks, and seven verified file checksums. Mypy, ESLint, TypeScript checks, and the production build also succeeded.
- **Limitations:** Counts are verified from logs; the screenshot shows job outcomes rather than every count. The 109 regression tests include simulated API responses. The five full-system tests use the actual application stack. Neither category proves physical-camera acceptance. Screenshot content, statuses, durations, and commit labels were not altered.

## Figure 6 — CI/CD Pipeline

- **Files/type:** [PNG](figure-06-cicd-pipeline.png), 3200 × 2163 px; [Mermaid source](figure-06-cicd-pipeline.mmd); [SVG export](figure-06-cicd-pipeline.svg); workflow diagram.
- **Sources:** `.github/workflows/ci.yml`, `scripts/delivery.py`, `backend/tests/run_system.py`, `backend/tests/run_compose.py`, Dockerfiles, Compose configurations, and the Figure 5 workflow logs.
- **Caption:** GitHub Actions performs application checks followed by Docker delivery validation. Tested images are packaged, checksum-verified, reloaded, and tested again before eligible runs publish the delivery artifact.
- **Verification:** The YAML was checked line by line for triggers, job dependencies, runtime versions, test order, static analysis, evidence upload, artifact retention, and publication conditions. `delivery.py` verifies archive file hashes and loaded image IDs against its manifest; restored-stack checks disable rebuilding and pulling.
- **Limitations:** Artifact publication is restricted to a push or manual dispatch on `main`; pull-request runs validate delivery without publishing the final bundle. Logs are retained when a run is not cancelled. Actionlint is documented separately but is not a stage in this workflow. Delivery produces a local Docker package, not an automatic public-cloud deployment. Counts refer specifically to run `44164413412`.

## Figure 7 — Docker Delivery Artifact

- **File/type:** [figure-07-docker-delivery-artifact.png](figure-07-docker-delivery-artifact.png); genuine GitHub artifact-list screenshot crop, 575 × 339 px.
- **Source:** [Artifacts in run 44164413412](https://github.com/elyannmarih/Computer-Vision-Based-Animal-Detection-and-Monitoring-System/actions/runs/44164413412).
- **Caption:** Published Docker delivery package `detectra-693ca02fb22cc0c15f0d2f2983b79ce596d79a77-linux-amd64-1`, alongside delivery-check and test-result evidence.
- **Verification:** The browser listing displayed the complete package name and a size of 911 MB. GitHub artifact metadata reported ID `14364638963`, 955,613,486 bytes, creation on November 17, 2026, and `expired=false` when inspected on November 20. The archive digest was `sha256:ed02e6a3808a09e630947b1deaba7a83a77f76bc7d896c890f2e7e5e0939fae3`.
- **Limitations:** Metadata reported expiration at November 24, 2026, 20:10:30 UTC. The screenshot preserves publication evidence but does not extend retention or guarantee future download availability. The archive was not downloaded during figure preparation; successful packaging, restore, and integrity evidence came from the recorded workflow logs.

## Placement and final checks

Use the report's existing seven figure locations and captions as the insertion guide. Preserve aspect ratio. Use a full portrait page for Figure 3 and generous full-width or landscape placement for Figures 4 and 6. For projected slides, show architecture and sequence details progressively; do not shrink all sequence messages into one 16:9 slide. The Mermaid sources allow labels and layout to be adjusted before regenerating exports. Screenshot crops retain their native detail; enlarging Figure 7 does not add resolution.

All seven primary PNGs and the three supplementary images (one lizard PNG, one person JPEG, and one physical-camera PNG) were opened for visual inspection. The replacement captures contain no visible cursor. SVG rendering, filenames, dimensions, labels, arrow placement, and allowed repository scope were checked. The captures contain no credentials. The retained user photograph is included with the project owner's explicit publication authorization. The November 21 physical-camera preview and manual Scan Now test is now documented in Figure 1d. No future test result or prolonged-operation claim is implied.


## Regenerating the Mermaid exports

The `.mmd` files are the source of truth for Figures 3, 4, and 6; do not edit the exported SVGs independently. With Mermaid CLI 12.2.0 and Times New Roman available, run the following from this directory, substituting each diagram basename:

```text
mmdc -i figure-03-system-architecture.mmd -o figure-03-system-architecture.svg --no-font-embed --size 3200 -b white
mmdc -i figure-03-system-architecture.mmd -o figure-03-system-architecture.png --size 3200 -b white
```

Repeat for `figure-04-analysis-verification-sequence` and `figure-06-cicd-pipeline`. Styling is included in each Mermaid file; no changes to application dependencies are required.
