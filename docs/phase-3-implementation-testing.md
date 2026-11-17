# Detectra: Phase III Implementation and Testing

CIS 553: Software Engineering, Fall 2026  
Elyann Soto and Evan Wilson  
Status reviewed November 17, 2026. We merged PR #3 into `main` at `693ca02`.

## 1. Project Overview

Detectra is a local web prototype for finding animals and people in uploaded images or camera frames. Users can inspect the confidence scores, reveal individual bounding boxes, and save Correct/Incorrect feedback. The project began with lizard detection as its main use case. The retained `yolov8s-oiv7` model now supports eleven categories through one detector. Phase III focuses on reproducing the application, checking its workflows, and preparing a tested delivery process. It does not train a new model.

## 2. Implemented Features

The dashboard links to image upload, Camera Scan, results, settings, and usage instructions. Uploads use real YOLO inference. Results show boxes and confidence scores, allow individual boxes to be hidden, and retain human reviews in PostgreSQL. Images without detections can also receive a review. Selecting no species disables detection without changing the model weights.

The camera backend supports one configured stream, live inference, on-demand capture, optional interval-based saving, and reconnection. Scan Now stores the frame and its metadata through the same analysis path as uploads. RTSP credentials stay in backend configuration and are removed from browser-facing status. Physical-camera operation still needs validation; automated camera tests use a generated video or controlled frame fixtures.

The local database scripts create the six application tables and insert fictional examples. Initialization rejects unrelated existing schemas and remote targets; repeating setup or seed does not reset records. Sample detections are visibly synthetic and are never presented as measured model performance.

## 3. Changes from Phase II

The comparison uses the [Phase II report preserved at commit cf37ec6](https://github.com/elyannmarih/Computer-Vision-Based-Animal-Detection-and-Monitoring-System/blob/cf37ec6/docs/CIS553_Group07_ProjectPhaseII_Report.pdf), especially the requirements on page 4 and planning tables on pages 11-16.

| Phase II scope | Current implementation |
| --- | --- |
| Train or fine-tune a lizard detector | Retain the original multiclass Open Images model after the earlier experimental comparison; no additional training in Phase III |
| Cloudinary image storage | Local files by default, with optional S3-compatible storage; PostgreSQL retains metadata and reviews |
| Controlled prototype without individual accounts | Still the supported scope; authentication remains required before public application hosting |
| Human feedback for later evaluation | Feedback persists and can be corrected; it does not trigger retraining |
| Camera scans and optional continuous monitoring | One configured stream supports live inference, Scan Now, and optional timed saves; physical validation is pending |
| CI/CD and deployment scheduled later in November | We merged PR #3 on November 17, 2026. GitHub Actions run 44164413412 passed on `main` and published the Docker archive. Repository visibility remains a separate decision |

Email verification links, multiple simultaneous live streams, analytics, automatic retraining, and RT-DETR comparison are not claimed as completed. The original interface layout was retained. The final audit replaced a demo photograph of unconfirmed origin with synthetic shapes without changing the UI structure.

## 4. Implementation Architecture

```mermaid
flowchart LR
    B[Browser] --> N[Next.js server proxy]
    N --> F[FastAPI]
    C[Configured camera or test video] --> F
    F --> Y[YOLO multiclass detector]
    F --> P[(PostgreSQL)]
    F --> S[Local images or S3-compatible storage]
```

The server-side Next.js proxy validates API responses and keeps backend configuration out of browser code. FastAPI coordinates inference, storage, and transactional feedback. PostgreSQL contains `cameras`, `models`, `trusted_persons`, `images`, `detections`, and `human_verifications`. The reviewer list identifies feedback authors; it does not authenticate them.

Compose runs PostgreSQL, FastAPI, and Next.js with separate persistent volumes for database records, uploads, model preferences, and the frontend cache. Application containers run as non-root users with read-only code. Only the frontend is published, on the host loopback address. Model weights remain unchanged; writable selection preferences live separately from them.

## 5. Software Testing

The [test record](phase-3-test-results.json) contains commands, UTC timestamps, individual test names, counts, and log hashes from our earlier runs. The suite totals below come from our [GitHub Actions run 44164413412](https://github.com/elyannmarih/Computer-Vision-Based-Animal-Detection-and-Monitoring-System/actions/runs/44164413412), which passed on November 17, 2026, for `main` at `693ca02`. The log reported `Ran 47 tests in 0.473s` followed by `OK`, `Ran 22 tests in 5.715s` followed by `OK`, `109 passed (1.8m)`, `5 passed (8.0s)`, `8 Docker checks passed.` twice, and `Verified 7 checksums and loaded matching Docker images.` Our pull-request run 42127623491 had the same counts. We did not change application or test files between `8d24056` and this merge.

| Executed check | Result | Scope |
| --- | --- | --- |
| Python unit suite | 47 passed, 0 failed, 0 skipped | Transactions, feedback aggregation, configuration, camera sanitization/recovery, model selection, and evaluation logic |
| PostgreSQL and YOLO integration suite | 22 passed, 0 failed, 0 skipped | Real database writes, schema and seed, inference, invalid files, concurrent feedback, and controlled camera capture |
| Browser regression suite | 109 passed, 0 failed, 0 skipped | API contracts plus desktop Chromium, mobile Chromium, and WebKit; API responses are simulated |
| Real system browser suite | 5 passed, 0 failed, 0 skipped | Real Next.js, FastAPI, PostgreSQL, YOLO, and generated-video workflows |
| Docker source and packaged-delivery checks | 8 passed in each run | Health, upload, inference, feedback, failure recovery, and persistence after container replacement |
| Delivery verification | 7 checksums verified and matching images loaded | Export/load round trip in run 44164413412. Our local guard checks also reject altered contents and untested image IDs. We did not repeat those guards as separate steps in the hosted run |

The application suites ran locally on Windows and in the isolated Linux CI rehearsal recorded in milestone 3. Docker validation used Linux amd64 containers through Docker Desktop. The final audit reran the 109 browser checks after replacing the demo and upload fixtures, plus 47 unit tests, mypy, and eight Docker checks against the rebuilt images. All passed. Checks for shared/external test volumes reject the configuration before creating or deleting resources.

### Test case summary

We summarized the major Phase II workflows that already have an automated test and that ran again on `main` in 44164413412. Browser rows that use a simulated API are marked. We left out physical RTSP capture, account management, live S3 storage, and automatic retraining because we have not run those checks.

| Test Case ID | Feature | Test Scenario | Expected Result | Actual Result | Test Type | Status |
| --- | --- | --- | --- | --- | --- | --- |
| TC-01 | Image analysis | Upload a valid image and run `yolov8s-oiv7` | The original image, model version, and detections are stored | Passed in run 44164413412: `test_real_yolo_upload_persists_boxes_model_and_original_image` and the system test "real upload, bounding boxes and feedback survive a browser reload" | Integration, system | Passed |
| TC-02 | Empty result | Upload a blank image | No boxes are invented, and the image can still be reviewed | Passed in run 44164413412: `test_real_yolo_blank_image_has_no_boxes_and_can_be_reviewed` and the system test "real blank upload can be reviewed without inventing detections" | Integration, system | Passed |
| TC-03 | Upload validation | Submit an invalid image | No detection row or stored file is created | Passed in run 44164413412: `test_invalid_uploads_do_not_create_rows_or_files` | Integration | Passed |
| TC-04 | Human review | Save and later revise Correct/Incorrect feedback | The revised verdict is stored and the aggregate counts change | Passed in run 44164413412: `test_feedback_revisions_persist_and_update_aggregate_counts` | Integration | Passed |
| TC-05 | Human review | Review an image that has no detection | The image is verified without creating a bounding box | Passed in run 44164413412: `test_no_detection_feedback_verifies_image_without_inventing_a_box_count` and the browser tests for Correct and Incorrect no-detection feedback | Unit, browser | Passed |
| TC-06 | Results display | Reveal or hide individual boxes and read their confidence | Each box can be shown or hidden, and its own review stays attached to that box | Passed in run 44164413412: "independent reveal, hide, verification and confidence" in desktop Chromium, mobile Chromium, and WebKit | Browser, simulated API | Passed |
| TC-07 | Species selection | Change the selected categories and reload | The selection persists and the weights remain `yolov8s-oiv7` | Passed in run 44164413412: the species-selection unit tests and the system test "species preferences persist without changing the model" | Unit, system | Passed |
| TC-08 | Species selection | Clear every category | Detection stops and the empty selection is kept | Passed in run 44164413412: `test_empty_selection_is_preserved_and_does_not_predict` | Unit | Passed |
| TC-09 | Camera status | Request status for a stream URL that contains credentials | The response omits the username, password, and stream URL | Passed in run 44164413412: `test_credentials_are_removed_and_never_appear_in_status` and the browser contract "live cameras expose status but never stream URLs or credentials" | Unit, browser | Passed |
| TC-10 | Camera scan | Use Scan Now on a generated local video | The frame is analyzed with the real model and its capture time is kept | Passed in run 44164413412: `test_camera_fixture_scan_uses_real_model_and_preserves_capture_time` and the system test "local video goes through the live camera and Scan Now workflow" | Integration, system | Passed |
| TC-11 | Database setup | Initialize and seed an empty local database, then repeat both commands | The schema and fictional samples are created once and existing reviews are not overwritten | Passed in run 44164413412: `test_empty_database_initializes_and_repeat_is_a_no_op` and `test_seed_is_repeatable_and_does_not_overwrite_reviewed_records` | Integration | Passed |
| TC-12 | Database safety | Point setup at a remote database or omit the explicit development URL | Setup is rejected and does not use the application database URL as a fallback | Passed in run 44164413412: `test_remote_or_implicit_hosts_are_rejected` and `test_application_database_url_is_never_a_fallback` | Unit | Passed |
| TC-13 | Navigation | Open the dashboard, the guide, and the main routes | The pages render and the guide links resolve | Passed in run 44164413412: "dashboard cards and sidebar navigation" and "guide includes six steps and working links" | Browser, simulated API | Passed |
| TC-14 | Local delivery | Start the built Compose stack, analyze an image, save feedback, restart the backend, and replace the containers | The stack becomes healthy, inference and feedback work, and data survives container replacement | Passed twice in run 44164413412. The log printed `8 Docker checks passed.` for the source images and again for the packaged Compose file | Docker | Passed |
| TC-15 | Delivery integrity | Verify the packaged archive and load its images | The listed checksums match and the restored image IDs match the manifest | Passed in run 44164413412. The log printed `Verified 7 checksums and loaded matching Docker images.` | Docker | Passed |

Integration tests create random local test databases, temporary uploads, and isolated preferences. They disable private environment loading, S3, and physical camera access. The NASA astronaut fixture has recorded public-domain provenance in `backend/tests/fixtures/provenance.json`. Frontend demo/test images are original geometric drawings, and database sample images are generated by the seed script. These fixtures validate application behavior, not accuracy on wild animals.

## 6. Static Analysis

Mypy passed for 14 Python source files, including checks inside unannotated functions. Its scope covers the API and database helpers; it excludes dependency inspection for Ultralytics and Boto3. It is not a strict typing guarantee for every module. ESLint, TypeScript checking, and the Next.js production build passed in the application and CI milestones. Actionlint 1.7.12 validated the workflow, and the Docker builds exercised the standalone frontend output.

The final security audit used pip-audit 2.10.1 against installed package inventories. The local pip installer was updated from 24.3.1 to 26.3, after which the 70-package local inventory had no reported advisories. The container audit identified an older `setuptools`; `backend/requirements.txt` now requires at least 84.1.0, and the rebuild installed 84.2.1. The final 65-package container inventory reported no advisories for the 63 recognized versions. PyPI did not recognize the two CPU-specific PyTorch versions; a separate advisory lookup using their base versions also returned no findings. That lookup does not independently audit the CPU wheel contents.

`npm audit` reports eight moderate findings in development tooling, all through the [minimatch glob-pattern advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249). `npm audit --omit=dev` reports zero findings. The upstream TypeScript ESLint dependency still requests minimatch 10; the offered automatic fix would downgrade the Next.js ESLint configuration across a major version. That change was not applied. A compatible upstream update or a separately tested override remains follow-up work. Package audits are date-specific and do not cover operating-system packages or establish that the application is secure.

## 7. CI/CD Implementation

`.github/workflows/ci.yml` runs for pull requests to `main`, pushes to `main`, and manual dispatch. The application job installs Python 3.13, Node.js 22, PostgreSQL 16, CPU PyTorch, and browser dependencies, then runs the test and static-analysis commands documented in the README. No shared database, camera, or repository secret is required.

The delivery job depends on the application job. It builds the application images, tests them, exports their exact IDs, verifies and reloads the archive, then tests the packaged Compose configuration with builds and pulls disabled. Failed commands fail the job. Actions are pinned to commit SHAs and the workflow token has read-only repository permissions. Diagnostic logs are retained for seven days.

Our [GitHub Actions run 44164413412](https://github.com/elyannmarih/Computer-Vision-Based-Animal-Detection-and-Monitoring-System/actions/runs/44164413412) passed on November 17, 2026, for merge commit `693ca02` on `main`. Application checks and Docker delivery both succeeded. The log counts are 47 unit tests, 22 integration tests, 109 browser regression tests, and 5 real-backend/YOLO browser workflows, plus static analysis, the production build, and the Docker checks described above. The delivery job published `detectra-693ca02fb22cc0c15f0d2f2983b79ce596d79a77-linux-amd64-1`. An earlier pull-request run, [42127623491](https://github.com/elyannmarih/Computer-Vision-Based-Animal-Detection-and-Monitoring-System/actions/runs/42127623491), passed for `f291eaf` with the same counts. Before that, [42122426016](https://github.com/elyannmarih/Computer-Vision-Based-Animal-Detection-and-Monitoring-System/actions/runs/42122426016) covered `8d24056`. The first hosted run, 42109868881, was cancelled after the 30-minute job limit during slow Ubuntu package downloads. Commit `8d24056` switched away from the Azure package mirror and separated frontend and browser installation into bounded steps.

## 8. Deployment and Release Artifacts

The supported demonstration is a local Docker Compose installation. The [README](../README.md#docker) provides setup, environment, seed, start, stop, and persistence instructions. Another machine needs Docker with Linux amd64 support and its own database password. No shared Neon access or camera is needed. A real camera additionally needs a private network route and an explicit configuration choice; automatic saves should remain disabled until captures are approved.

The delivery archive contains backend, frontend, and PostgreSQL images, a Compose file without build instructions, schema SQL, a safe environment example, startup instructions, a manifest, smoke-test evidence, and checksums. It excludes live volumes and private configuration. A successful `main` push or manual run is configured to retain a downloadable artifact for seven days. No registry publication, GitHub Release, or public deployment is configured.

Run 44164413412 built the frontend and backend images, pulled PostgreSQL 16, tested that source stack, packaged the tested image IDs, verified seven checksums, loaded the archive, and passed the same eight checks against the packaged Compose file. It then published `detectra-693ca02fb22cc0c15f0d2f2983b79ce596d79a77-linux-amd64-1`. GitHub retains that archive for seven days.

A local development preview was exported and loaded in milestone 5. It predates the final fixture and dependency audit changes, so it is superseded and must not be used as the final submission artifact. The published archive from `693ca02` is the bundle for this revision. Keep an existing installation's configuration and project name, back up its volumes, and review future schema changes before upgrading; the schema script is an initializer, not a migration framework.

## 9. Known Limitations

The retained historical evaluation contains 214 partly annotated validation images. Lizard recall was 36.1% (22 detected, 39 missed); conditional precision does not measure overall multiclass precision. The smallest lizards were missed. These earlier research results are not Phase III accuracy tests, and there is no independent final test result. CPU inference cost, field conditions, and physical RTSP reliability still need practical evaluation.

The prototype has no authentication, per-user authorization, or private signed-image delivery. Local images and camera endpoints must remain within a controlled environment. S3 mode expects public image URLs and was not tested against a live bucket in this phase. Do not expose the application or private captures publicly without implementing and validating access controls.

For repository publication, Gitleaks 8.30.1 scanned all local Git refs with full history and reported no secrets. Additional checks covered credential URLs, private-address examples, and exact matches for configured local secrets without printing their values. Matches in the text-pattern check were examples or test fixtures. No credential was identified as needing revocation from this scan.

We are preserving the repository's existing history. The current demo/test images are synthetic. The earlier house photograph remains in previous commits and matches the [entrance image in our Figma design](https://www.figma.com/design/CNNQIPpuNQoz283NL0pyGe/Detectra?node-id=10-679): its Figma image hash matches the historical file's SHA-1, and both have 1600 by 1067 dimensions. The historical Phase II PDF includes two student contact emails. Those emails and normal Git author information are not credentials and are not scheduled for removal. A cleanup trial was verified in a separate local copy, but it has not been applied to this branch or GitHub. Rewriting history is not an application or CI requirement. The repository remains private, and changing its visibility is a separate decision. The audit covers reachable objects, not deleted remote refs, forks, or third-party copies.

## 10. Team Contributions

The Phase II Gantt records planned responsibilities, not proof that work was completed by one person. The table below combines that plan with commit subjects and changed files. It does not assign every line of a commit exclusively to its author.

| Area | Recorded contribution and planning reference |
| --- | --- |
| Frontend and user workflow | Elyann's `1c4055e` adds the Next.js interface and initial tests; `53ff1e8` connects it to FastAPI and feedback. Evan's `e30f312` also changes upload, results, and live-camera integration. The Gantt assigns interface/results/review work to Elyann and image input to Evan. |
| Backend, database, and inference | Evan's commits under `SleepingBear23` include the initial FastAPI implementation and seed (`2700bb0`), YOLO/RTSP backend (`17d6c2c`), and earlier model selection work (`5d1f74d`). These support the backend and database responsibilities in the Gantt. |
| Integration and refinement | Both authors appear in the integrated history. Elyann's later commits include detection/review fixes (`8b50351`), camera-state correction (`1ab98c1`), species selection (`95dd47d`), and consolidation of the retained model (`e1db3ab`). The Gantt lists image integration as shared work. |
| Phase III validation and delivery | Our database, testing, CI, Docker, and delivery commits are recorded under Elyann's account: `3365a97`, `c4080c5`, `a416ffa`, `25368a5`, and `3bebf2b`. Evan approved our pull request on November 16, 2026, at commit `f291eaf`, without inline comments. We updated this report after that approval. The Phase II Gantt assigned testing and mypy mainly to Evan and CI, Docker, and deployment to both of us. We are not treating that plan as completed work, and the approval does not add Phase III commits under Evan's account. |

The repository remains private. [PR #1](https://github.com/elyannmarih/Computer-Vision-Based-Animal-Detection-and-Monitoring-System/pull/1), authored by Evan under `SleepingBear23`, is closed; his backend work is included in the existing development history. [PR #3](https://github.com/elyannmarih/Computer-Vision-Based-Animal-Detection-and-Monitoring-System/pull/3) contains the Phase III implementation. Existing authorship and commits are preserved.

Evan approved [PR #3](https://github.com/elyannmarih/Computer-Vision-Based-Animal-Detection-and-Monitoring-System/pull/3) on November 16, 2026, at commit `f291eaf`, without inline comments. We merged it into `main` on November 17, 2026. The merge commit is `693ca02`. Run 44164413412 passed on that commit and published the delivery archive. We are not using the planned Gantt to rewrite recorded authorship.

## 11. Conclusion

Detectra has a working local application, reproducible database examples, recorded automated tests, and a container delivery archive published from `main`. We kept the original model and the recorded contributions. Evan approved PR #3 on November 16, 2026, and we merged it on November 17, 2026. Run 44164413412 passed on `main`. Physical-camera validation and the repository visibility decision remain open. We are keeping the existing development history.
