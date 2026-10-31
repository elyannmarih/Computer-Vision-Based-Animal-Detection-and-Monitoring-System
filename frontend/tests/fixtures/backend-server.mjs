// Deterministic FastAPI contract fixture. No database, secrets or external services.
import http from "node:http";
const imageId = "11111111-1111-4111-8111-111111111111";
const detectionId = "33333333-3333-4333-8333-333333333333";
const reviewerId = "22222222-2222-4222-8222-222222222222";
const imagePath = "images/2026/10/24/11111111111111111111111111111111.png";
function send(res, status, value) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); }
const server = http.createServer(async (req, res) => {
  if (req.url === "/health") return send(res, 200, { status: "ok", storage: "local" });
  if (req.url === "/trusted-persons?limit=500") return send(res, 200, [{ trusted_person_id: reviewerId, first_name: "Contract", last_name: "Reviewer", email: "private@example.test", phone_number: "private", primary_account_id: imageId }]);
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  if (req.url === "/analyze") {
    const filename = /filename="([^"]+)"/.exec(text)?.[1] ?? "";
    if (filename === "error.png") return send(res, 500, { detail: "PRIVATE_DATABASE_ERROR_TOKEN" });
    const image_url = filename === "external.png" ? "https://example.invalid/private.png" : `http://127.0.0.1:8101/uploads/${imagePath}`;
    const d = { detection_id: detectionId, image_id: imageId, class_label: "lizard", confidence: 0.948, x_min: filename === "invalid-box.png" ? 0.99 : 0.17, y_min: 0.41, width: 0.22, height: 0.25 };
    return send(res, 201, { image: { image_id: imageId, image_url }, model_version: "stub-0.1", detections: [d] });
  }
  if (req.url === `/detections/${detectionId}/verify` || req.url === `/images/${imageId}/verify`) {
    const body = JSON.parse(text);
    if (body.verified_by_id !== reviewerId) return send(res, 409, { detail: "PRIVATE_DATABASE_ERROR_TOKEN" });
    if (req.url.startsWith("/detections/") && !["correct", "incorrect"].includes(body.verdict)) return send(res, 422, {});
    if (req.url.startsWith("/images/") && typeof body.target_found !== "boolean") return send(res, 422, {});
    if (req.url.startsWith("/detections/") && body.image_id !== imageId) return send(res, 422, {});
    const last = req.url.startsWith("/detections/") ? "3" : body.target_found ? "5" : "4";
    return send(res, 201, { verification_id: `44444444-4444-4444-8444-44444444444${last}`, verified_by_id: body.verified_by_id });
  }
  if (req.url === `/uploads/${imagePath}` || req.url === `/uploads/${framePath}`) {
    const { readFile } = await import("node:fs/promises");
    res.writeHead(200, { "Content-Type": "image/png" }); res.end(await readFile(new URL("./image.png", import.meta.url))); return;
  }

  // Saved results by id: the images, detections and models tables
  if (req.url === `/images/${imageId}`) return send(res, 200, imageRow(imageId, imagePath, null));
  if (req.url === `/images/${frameId}`) return send(res, 200, imageRow(frameId, framePath, cameraId));
  if (req.url === `/images/${badLabelId}`) return send(res, 200, imageRow(badLabelId, imagePath, null));
  if (req.url === `/detections?image_id=${imageId}&limit=500`) return send(res, 200, [{ detection_id: detectionId, image_id: imageId, model_id: modelId, class_label: "lizard", confidence: 0.948, x_min: 0.17, y_min: 0.41, width: 0.22, height: 0.25 }]);
  if (req.url === `/detections?image_id=${frameId}&limit=500`) return send(res, 200, [dogDetection]);
  if (req.url === `/detections?image_id=${badLabelId}&limit=500`) return send(res, 200, [{ ...dogDetection, image_id: badLabelId, class_label: "<img src=x onerror=alert(1)>" }]);
  if (req.url === `/models/${modelId}`) return send(res, 200, { model_id: modelId, version_number: "dog-yolo11s", precision_rating: null });

  // Detector models
  if (req.url === "/detector" && req.method === "GET") return send(res, 200, models());
  if (req.url === "/detector" && req.method === "PUT") {
    const body = JSON.parse(text);
    if (!models().some((m) => m.version === body.version)) return send(res, 404, { detail: "No model named PRIVATE_PATH_TOKEN" });
    activeModel = body.version;
    return send(res, 200, models().find((m) => m.active));
  }

  // Live cameras: the status never contains the stream URL; the fixture slips one into "error" to prove it's dropped
  if (req.url === "/live") return send(res, 200, [{ camera_id: cameraId, location_name: "Backyard", connected: true, error: "rtsp://user:PRIVATE_PASSWORD@10.0.0.1/stream", width: 1920, height: 1080, fps: 9.5, model_version: activeModel, detections: [{ class_label: "dog", confidence: 0.73, x_min: 0.2, y_min: 0.2, width: 0.3, height: 0.3 }], last_frame_at: "2026-10-31T16:00:00Z", last_saved_at: null, save_interval: 30, save_confidence: 0.5 }]);
  if (req.url === `/live/${cameraId}/video`) {
    const { readFile } = await import("node:fs/promises");
    const jpeg = await readFile(new URL("./image.jpg", import.meta.url));
    res.writeHead(200, { "Content-Type": "multipart/x-mixed-replace; boundary=frame" });
    res.end(Buffer.concat([Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`), jpeg, Buffer.from("\r\n")])); return;
  }
  if (req.url === `/live/${cameraId}/scan` && req.method === "POST") return send(res, 201, { image: imageRow(frameId, framePath, cameraId), detections: [dogDetection], model_version: "dog-yolo11s" });
  if (req.url === `/images?camera_id=${cameraId}&limit=6`) return send(res, 200, [imageRow(frameId, framePath, cameraId)]);
  send(res, 404, {});
});
const cameraId = "66666666-6666-4666-8666-666666666666";
const frameId = "77777777-7777-4777-8777-777777777777";
const badLabelId = "99999999-9999-4999-8999-999999999999";
const modelId = "55555555-5555-4555-8555-555555555555";
const framePath = "images/2026/10/31/77777777777777777777777777777777.jpg";
const dogDetection = { detection_id: "88888888-8888-4888-8888-888888888888", image_id: frameId, model_id: modelId, class_label: "dog", confidence: 0.73, x_min: 0.2, y_min: 0.2, width: 0.3, height: 0.3 };
function imageRow(id, path, camera) {
  return { image_id: id, camera_id: camera, image_url: `http://127.0.0.1:8101/uploads/${path}`, captured_at: "2026-10-31T16:00:00Z", uploaded_at: "2026-10-31T16:00:00Z", number_detections: 1 };
}
let activeModel = "yolo11n-test";
function models() {
  return [
    { version: "dog-yolo11s", title: "Dogs", classes: ["dog"], precision: null },
    { version: "yolo11n-test", title: "Lizards", classes: ["lizard"], precision: 0.79 },
  ].map((m) => ({ ...m, active: m.version === activeModel }));
}
server.listen(8101, "127.0.0.1");
