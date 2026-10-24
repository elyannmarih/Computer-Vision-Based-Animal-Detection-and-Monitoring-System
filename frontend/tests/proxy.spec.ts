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
