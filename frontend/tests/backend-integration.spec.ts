import { expect, test } from "@playwright/test";
import path from "node:path";
const imageId = "11111111-1111-4111-8111-111111111111";
const reviewerId = "22222222-2222-4222-8222-222222222222";
const detectionId = "33333333-3333-4333-8333-333333333333";
const backendResult = (detected = true) => ({ ok: true, data: {
  id: imageId, mode: "backend", modelVersion: "stub-0.1", simulated: true,
  image: { url: "/demo/camera-frame.png", name: "image.png", origin: "upload" },
  detections: detected ? [{ id: detectionId, label: "lizard", confidence: 0.72, box: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 } }] : [],
} });
test.beforeEach(async ({ page }) => {
  await page.route("**/api/detectra/health", r => r.fulfill({ json: { ok: true, data: { status: "ok" } } }));
  await page.route("**/api/detectra/reviewers", r => r.fulfill({ json: { ok: true, data: [{ id: reviewerId, name: "Integration Test Reviewer" }] } }));
});
for (const detected of [true, false]) test(`mocked backend upload and acknowledged ${detected ? "detection" : "no detection"} feedback`, async ({ page }) => {
  let uploads = 0;
  await page.route("**/api/detectra/analyze", async route => {
    uploads++;
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
    await route.fulfill({ json: backendResult(detected) });
  });
  let verification: Record<string, unknown> | undefined;
  await page.route("**/api/detectra/verify", async route => {
    verification = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, data: { verificationId: reviewerId } } });
  });
  await page.goto("/upload");
  await page.getByLabel("Select an image").setInputFiles(path.join(__dirname,"fixtures/image.png"));
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Backend results · Simulated model" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/results\\?image=${imageId}$`));
  await expect(page.getByText(/FastAPI stored this image/)).toBeVisible();
  await expect(page.getByLabel("Demo scenario")).toHaveCount(0);
  if (detected) {
    await expect(page.getByText("72.0%", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Reveal detection 1", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Correct", exact: true })).toBeDisabled();
  await page.getByLabel("Reviewer for saved feedback").selectOption(reviewerId);
  await page.getByRole("button", { name: "Incorrect", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Marked incorrect (saved to backend)" })).toBeVisible();
  expect(uploads).toBe(1);
  expect(verification).toEqual({ resultId: imageId, ...(detected ? { detectionId } : {}), verdict: "incorrect", reviewerId });
});
test("backend errors keep the uploaded image and allow retry", async ({ page }) => {
  await page.route("**/api/detectra/analyze", r => r.fulfill({ status: 502, json: { ok: false, error: { code: "connection", message: "Backend unavailable. Retry later.", retryable: true } } }));
  await page.goto("/upload");
  await page.getByLabel("Select an image").setInputFiles(path.join(__dirname,"fixtures/image.png"));
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Backend unavailable");
  await expect(page.getByRole("img", { name: /Preview of/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze image", exact: true })).toBeEnabled();
});
test("failed feedback is never shown as saved and can be retried", async ({ page }) => {
  await page.route("**/api/detectra/analyze", r => r.fulfill({ json: backendResult(false) }));
  let fail = true;
  await page.route("**/api/detectra/verify", r => r.fulfill({ status: fail ? 502 : 200, json: fail ? { ok: false, error: { message: "Feedback not confirmed. Check backend before retrying.", code: "connection" } } : { ok: true, data: { verificationId: reviewerId } } }));
  await page.goto("/upload");
  await page.getByLabel("Select an image").setInputFiles(path.join(__dirname,"fixtures/image.png"));
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await page.getByLabel("Reviewer for saved feedback").selectOption(reviewerId);
  await page.getByRole("button", { name: "Correct", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("not confirmed");
  await expect(page.getByText("Marked correct (saved to backend)")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Correct", exact: true }).click();
  await expect(page.getByText("Marked correct (saved to backend)")).toBeVisible();
});
test("missing reviewers leaves verification disabled", async ({ page }) => {
  await page.route("**/api/detectra/reviewers", r => r.fulfill({ json: { ok: true, data: [] } }));
  await page.route("**/api/detectra/analyze", r => r.fulfill({ json: backendResult(false) }));
  await page.goto("/upload");
  await page.getByLabel("Select an image").setInputFiles(path.join(__dirname,"fixtures/image.png"));
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page.getByText(/No reviewer available yet/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Correct", exact: true })).toBeDisabled();
});

for (const malformed of [false, true]) test(`rejects ${malformed ? "missing success data" : "HTTP failure with success envelope"}`, async ({ page }) => {
  await page.route("**/api/detectra/analyze", r => r.fulfill({ status: malformed ? 200 : 500, json: malformed ? { ok: true } : backendResult() }));
  await page.goto("/upload");
  await page.getByLabel("Select an image").setInputFiles(path.join(__dirname, "fixtures/image.png"));
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Request not confirmed");
  await expect(page).toHaveURL(/\/upload$/);
});
test("late analysis response does not navigate away from the chosen page", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const received = new Promise<void>(resolve => { started = resolve; });
  await page.route("**/api/detectra/analyze", async route => {
    started(); await gate; await route.fulfill({ json: backendResult() });
  });
  await page.goto("/upload");
  await page.getByLabel("Select an image").setInputFiles(path.join(__dirname, "fixtures/image.png"));
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await received;
  await page.getByRole("link", { name: "How to use", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/how-to-use$/);
  const completed = page.waitForResponse("**/api/detectra/analyze");
  release(); await completed;
  await expect(page.getByRole("heading", { name: "A simple guide to Detectra" }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/how-to-use$/);
});
test("reviewer loading blocks overlapping reloads", async ({ page }) => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/detectra/reviewers", async route => {
    calls++; await gate;
    await route.fulfill({ json: { ok: true, data: [{ id: reviewerId, name: "Test reviewer" }] } });
  });
  await page.route("**/api/detectra/analyze", r => r.fulfill({ json: backendResult(false) }));
  await page.goto("/upload");
  await page.getByLabel("Select an image").setInputFiles(path.join(__dirname, "fixtures/image.png"));
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  const panel = page.getByRole("region", { name: "Backend verification" });
  await expect(panel.getByRole("button", { name: "Loading reviewers…" })).toBeDisabled();
  await expect(page.getByLabel("Reviewer for saved feedback")).toBeDisabled();
  await expect.poll(() => calls).toBe(1);
  release();
  await expect(panel.getByRole("button", { name: "Reload reviewers" })).toBeEnabled();
  expect(calls).toBe(1);
});
