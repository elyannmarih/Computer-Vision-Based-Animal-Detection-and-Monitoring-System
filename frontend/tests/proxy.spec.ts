import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const imageId = "11111111-1111-4111-8111-111111111111";
const detectionId = "33333333-3333-4333-8333-333333333333";
const reviewerId = "22222222-2222-4222-8222-222222222222";
const buffer = fs.readFileSync(path.join(__dirname, "fixtures/image.png"));
test("server adapter maps FastAPI result and proxies its stored image", async ({ request }) => {
  const response = await request.post("/api/detectra/analyze", { multipart: { image: { name: "image.png", mimeType: "image/png", buffer } } });
  expect(response.ok()).toBe(true);
  const result = (await response.json()).data;
  expect(result).toMatchObject({ id: imageId, mode: "backend", simulated: true, modelVersion: "stub-0.1" });
  expect(result.detections[0]).toMatchObject({ id: detectionId, confidence: 0.948, box: { x: 0.17, y: 0.41, width: 0.22, height: 0.25 } });
  expect(result.image.url).toBe("/api/detectra/images/images/2026/10/24/11111111111111111111111111111111.png");
  const image = await request.get(result.image.url);
  expect(image.ok()).toBe(true); expect(image.headers()["content-type"]).toBe("image/png");
  expect(await image.body()).toEqual(buffer);
});
for (const name of ["external.png", "invalid-box.png", "error.png"]) test(`adapter rejects or sanitizes ${name}`, async ({ request }) => {
  const response = await request.post("/api/detectra/analyze", { multipart: { image: { name, mimeType: "image/png", buffer } } });
  expect(response.status()).toBe(502);
  const text = await response.text(); expect(text).not.toContain("PRIVATE_DATABASE_ERROR_TOKEN"); expect(text).not.toContain("example.invalid"); expect(JSON.parse(text).ok).toBe(false);
});
test("upload proxy rejects invalid file type and missing files", async ({ request }) => {
  const bad = await request.post("/api/detectra/analyze", { multipart: { image: { name: "bad.txt", mimeType: "text/plain", buffer } } });
  expect(bad.status()).toBe(415);
  const missing = await request.post("/api/detectra/analyze", { multipart: {} });
  expect(missing.status()).toBe(415);
});
test("reviewers and health expose only necessary fields", async ({ request }) => {
  const response = await request.get("/api/detectra/reviewers");
  expect(await response.json()).toEqual({ ok: true, data: [{ id: reviewerId, name: "Contract Reviewer" }] });
  const health = await request.get("/api/detectra/health"); expect(await health.json()).toEqual({ ok: true, data: { status: "ok" } });
});
for (const verdict of ["correct", "incorrect"]) test(`maps ${verdict} no-detection feedback to target_found`, async ({ request }) => {
  const response = await request.post("/api/detectra/verify", { data: { resultId: imageId, reviewerId, verdict } });
  expect(response.ok()).toBe(true);
  expect((await response.json()).data.verificationId).toBe(`44444444-4444-4444-8444-44444444444${verdict === "correct" ? "4" : "5"}`);
});
test("maps individual feedback and rejects invalid identifiers", async ({ request }) => {
  const response = await request.post("/api/detectra/verify", { data: { resultId: imageId, detectionId, reviewerId, verdict: "incorrect" } });
  expect(response.ok()).toBe(true);
  const invalid = await request.post("/api/detectra/verify", { data: { resultId: "../cameras", reviewerId, verdict: "correct" } });
  expect(invalid.status()).toBe(400);
  const image = await request.get("/api/detectra/images/not-an-image"); expect(image.status()).toBe(404);
});
test("individual verification forwards the result image for ownership validation", async ({ request }) => {
  const response = await request.post("/api/detectra/verify", { data: { resultId: "55555555-5555-4555-8555-555555555555", detectionId, reviewerId, verdict: "correct" } });
  expect(response.status()).toBe(422);
  expect((await response.json()).ok).toBe(false);
});
const cameraId = "66666666-6666-4666-8666-666666666666";
const frameId = "77777777-7777-4777-8777-777777777777";
const mixedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const emptyReviewedId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const emptyOpenId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const reviewedDetectionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const openDetectionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
test("saved reviews are restored and unreviewed detections stay unreviewed", async ({ request }) => {
  const mixed = await (await request.get(`/api/detectra/results/${mixedId}`)).json();
expect(mixed.data.detections.map((d: { id: string; review?: string }) => ({ id: d.id, review: d.review ?? null }))).toEqual([
    { id: reviewedDetectionId, review: "correct" },
    { id: openDetectionId, review: null },
  ]);
  expect(mixed.data.review).toBeUndefined();
  const missed = await (await request.get(`/api/detectra/results/${emptyReviewedId}`)).json();
  expect(missed.data.detections).toEqual([]);
  expect(missed.data.review).toBe("incorrect");
  const open = await (await request.get(`/api/detectra/results/${emptyOpenId}`)).json();
  expect(open.data.detections).toEqual([]);
  expect(open.data.review).toBeUndefined();
  expect(JSON.stringify(mixed.data) + JSON.stringify(missed.data)).not.toMatch(/verified_by_id|target_found/);
});
test("saved results load by id with their model version and any class label", async ({ request }) => {
  const upload = await (await request.get(`/api/detectra/results/${imageId}`)).json();
  expect(upload.data).toMatchObject({ id: imageId, mode: "backend", modelVersion: "dog-yolo11s", image: { origin: "upload" } });
  const frame = await (await request.get(`/api/detectra/results/${frameId}`)).json();
  expect(frame.data).toMatchObject({ id: frameId, image: { origin: "camera" }, capturedAt: "2026-10-31T16:00:00.000Z" });
  expect(frame.data.detections[0]).toMatchObject({ label: "dog", confidence: 0.73 });
  const image = await request.get(frame.data.image.url); expect(image.ok()).toBe(true);
});
test("results reject unsafe labels, bad ids and missing records", async ({ request }) => {
  const unsafe = await request.get("/api/detectra/results/99999999-9999-4999-8999-999999999999");
  expect(unsafe.status()).toBe(502); expect(await unsafe.text()).not.toContain("onerror");
  expect((await request.get("/api/detectra/results/..%2Fcameras")).status()).toBe(404);
  expect((await request.get("/api/detectra/results/12345678-1234-4234-8234-123456789012")).status()).toBe(404);
});
test("live cameras expose status but never stream URLs or credentials", async ({ request }) => {
  const response = await request.get("/api/detectra/live");
  const text = await response.text();
  expect(text).not.toMatch(/rtsp|PRIVATE_PASSWORD|10\.0\.0\.1/);
  expect(JSON.parse(text).data).toEqual([{ id: cameraId, name: "Backyard", connected: true, error: null, width: 1920, height: 1080, fps: 9.5,
    modelVersion: expect.any(String), detections: [{ label: "dog", confidence: 0.73 }], lastSavedAt: null, saveInterval: 30, saveConfidence: 0.5 }]);
});
test("live video is passed through as MJPEG and scans return the saved frame", async ({ request }) => {
  const video = await request.get(`/api/detectra/live/${cameraId}/video`);
  expect(video.headers()["content-type"]).toBe("multipart/x-mixed-replace; boundary=frame");
  expect((await video.body()).subarray(0, 7).toString()).toBe("--frame");
  const scan = await request.post(`/api/detectra/live/${cameraId}/scan`);
  expect((await scan.json()).data).toMatchObject({ id: frameId, modelVersion: "dog-yolo11s", image: { origin: "camera" } });
  const captures = await request.get(`/api/detectra/live/${cameraId}/captures`);
  expect((await captures.json()).data).toEqual([{ id: frameId, capturedAt: "2026-10-31T16:00:00.000Z", detections: 1 }]);
  expect((await request.post("/api/detectra/live/not-a-camera/scan")).status()).toBe(404);
});
test("detector models list and switch, without leaking backend errors", async ({ request }) => {
  const list = (await (await request.get("/api/detectra/detector")).json()).data;
  expect(list.map((m: { title: string }) => m.title)).toEqual(["Dogs", "Lizards"]);
  const switched = await request.put("/api/detectra/detector", { data: { version: "dog-yolo11s" } });
  expect((await switched.json()).data).toMatchObject({ version: "dog-yolo11s", active: true });
  const missing = await request.put("/api/detectra/detector", { data: { version: "no-such-model" } });
  expect(missing.status()).toBe(404); expect(await missing.text()).not.toContain("PRIVATE_PATH_TOKEN");
  expect((await request.put("/api/detectra/detector", { data: { version: "../../etc" } })).status()).toBe(400);
  await request.put("/api/detectra/detector", { data: { version: "yolo11n-test" } });
});
