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
  if (req.url === `/uploads/${imagePath}`) {
    const { readFile } = await import("node:fs/promises");
    res.writeHead(200, { "Content-Type": "image/png" }); res.end(await readFile(new URL("./image.png", import.meta.url))); return;
  }
  send(res, 404, {});
});
server.listen(8101, "127.0.0.1");
