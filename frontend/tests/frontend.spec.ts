import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const fixture = (extension = "png") => path.join(__dirname, "fixtures", `image.${extension}`);

/** The FastAPI backend is mocked: tests need no database, model or camera. */
const API = /^http:\/\/127\.0\.0\.1:8000/;
const image = (id: string, extra = {}) => ({
  image_id: id, camera_id: null, image_url: `http://127.0.0.1:8000/uploads/${id}.png`, captured_at: "2026-10-31T16:00:00Z",
  uploaded_at: "2026-10-31T16:00:00Z", targets_detected: true, number_detections: 2, number_targets_detected: 2, ...extra,
});
const detection = (id: string, imageId: string, confidence: number, x: number, label = "lizard") => ({
  detection_id: id, image_id: imageId, model_id: "model-1", class_label: label, confidence, x_min: x, y_min: 0.3, width: 0.2, height: 0.25,
});
const results: Record<string, { image: ReturnType<typeof image>; detections: ReturnType<typeof detection>[] }> = {
  "img-1": { image: image("img-1"), detections: [detection("d-a", "img-1", 0.861, 0.6), detection("d-b", "img-1", 0.948, 0.1)] },
  "img-empty": { image: image("img-empty", { targets_detected: false, number_detections: 0, number_targets_detected: 0 }), detections: [] },
  "img-cam": { image: image("img-cam", { camera_id: "cam-1", number_detections: 1 }), detections: [detection("d-c", "img-cam", 0.7, 0.4)] },
};
const liveCamera = {
  camera_id: "cam-1", location_name: "Backyard", connected: true, error: null, width: 1920, height: 1080, fps: 9.5,
  model_version: "yolo11n-test", detections: [{ class_label: "lizard", confidence: 0.73, x_min: 0.2, y_min: 0.2, width: 0.3, height: 0.3 }],
  last_frame_at: "2026-10-31T16:00:00Z", last_saved_at: null, save_interval: 30, save_confidence: 0.5,
};
const detectorModels = [
  { version: "dog-test", title: "Dogs", classes: ["dog"], precision: null },
  { version: "yolo11n-test", title: "Lizards", classes: ["lizard"], precision: 0.79 },
];
type Options ={ analyzeImageId?: string; analyzeStatus?: number; live?: unknown[] | "offline" };

async function mockApi(page: Page, options: Options = {}) {
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  let active = "yolo11n-test";
  await page.route(API, async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p === "/live") return options.live === "offline" ? route.abort("connectionrefused") : json(route, options.live ?? []);
    if (p === "/analyze") {
      if (options.analyzeStatus) return json(route, { detail: "This image could not be opened. Choose a valid image." }, options.analyzeStatus);
      return json(route, { ...results[options.analyzeImageId ?? "img-1"], model_version: "yolo11n-test" }, 201);
    }
    if (p === "/live/cam-1/scan") return json(route, { ...results["img-cam"], model_version: "yolo11n-test" }, 201);
    if (p.startsWith("/uploads/") || p === "/live/cam-1/video") return route.fulfill({ contentType: "image/png", body: fs.readFileSync(fixture()) });
    if (p === "/images" && url.searchParams.get("camera_id")) return json(route, [results["img-cam"].image]);
    const imageMatch = p.match(/^\/images\/(.+)$/);
    if (imageMatch) return results[imageMatch[1]] ? json(route, results[imageMatch[1]].image) : json(route, { detail: "images row not found" }, 404);
    if (p === "/detections") return json(route, results[url.searchParams.get("image_id") ?? ""]?.detections ?? []);
    if (p.startsWith("/models/")) return json(route, { version_number: "yolo11n-test" });
    if (p === "/detector") {
      if (route.request().method() === "PUT") active = JSON.parse(route.request().postData() ?? "{}").version;
      const models = detectorModels.map((m) => ({ ...m, active: m.version === active }));
      return json(route, route.request().method() === "PUT" ? models.find((m) => m.active) : models);
    }
    return json(route, { detail: "Not Found" }, 404);
  });
}

async function upload(page: Page) {
  await page.goto("/upload");
  await page.getByLabel("Select an image").setInputFiles(fixture());
  await expect(page.getByRole("img", { name: /Preview of/ })).toBeVisible();
}
async function results_(page: Page) {
  await upload(page);
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\?image=img-1$/);
  await expect(page.getByRole("heading", { name: "Detection results", exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => mockApi(page));

test("dashboard cards and sidebar navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /What would you like/ })).toBeVisible();
  await page.getByRole("link", { name: /01 Upload image/ }).click();
  await expect(page).toHaveURL(/\/upload$/);
  const nav = page.getByRole("navigation", { name: test.info().project.name.startsWith("mobile") ? "Mobile navigation" : "Primary navigation", exact: true });
  await nav.getByRole("link", { name: "Camera scan" }).click();
  await expect(page.getByRole("heading", { name: "Live camera" })).toBeVisible();
  await nav.getByRole("link", { name: "How to use" }).click();
  await expect(page.getByRole("heading", { name: "A simple guide to Detectra" })).toBeVisible();
  await nav.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("link", { name: /02 Scan camera/ }).click();
  await expect(page).toHaveURL(/\/camera$/);
  await page.getByRole("link", { name: "Return home" }).click();
  await expect(page).toHaveURL("/");
});
for (const extension of ["jpg", "png", "webp"]) test(`accepts valid ${extension}`, async ({ page }) => {
  await page.goto("/upload");
  await page.getByLabel("Select an image").setInputFiles(fixture(extension));
  await expect(page.getByRole("img", { name: `Preview of image.${extension}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze image", exact: true })).toBeEnabled();
});
test("rejects unsupported, oversized and corrupt images", async ({ page }) => {
  await page.goto("/upload");
  const input = page.getByLabel("Select an image");
  await input.setInputFiles({ name: "document.txt", mimeType: "text/plain", buffer: Buffer.from("text") });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("JPG, PNG, or WEBP");
  await input.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("10 MB");
  await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("could not be opened");
  await expect(page.getByRole("button", { name: "Analyze image", exact: true })).toBeDisabled();
});
test("remove, reselect and replace image", async ({ page }) => {
  await upload(page);
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect(page.getByRole("img", { name: /Preview of/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analyze image", exact: true })).toBeDisabled();
  await page.getByLabel("Select an image").setInputFiles(fixture());
  await expect(page.getByRole("img", { name: /Preview of/ })).toBeVisible();
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Replace image" }).click();
  await (await picker).setFiles(fixture("jpg"));
  await expect(page.getByRole("img", { name: "Preview of image.jpg" })).toBeVisible();
});
test("empty image cannot be analyzed; picker is keyboard accessible", async ({ page }) => {
  await page.goto("/upload");
  await expect(page.getByRole("button", { name: "Analyze image", exact: true })).toBeDisabled();
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Drop your image here/ }).focus();
  await page.keyboard.press("Enter");
  await (await picker).setFiles(fixture());
  await expect(page.getByRole("img", { name: /Preview of/ })).toBeVisible();
});
test("drag and drop image", async ({ page }) => {
  await page.goto("/upload");
  const bytes = Array.from(await (await import("node:fs/promises")).readFile(fixture()));
  const transfer = await page.evaluateHandle((data) => {
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(data)], "dropped.png", { type: "image/png" })); return dt;
  }, bytes);
  await page.getByRole("button", { name: /Drop your image here/ }).dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByRole("img", { name: "Preview of dropped.png" })).toBeVisible();
});
test("server errors while analyzing are shown on the upload page", async ({ page }) => {
  await mockApi(page, { analyzeStatus: 422 });
  await upload(page);
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("could not be opened");
  await expect(page).toHaveURL(/\/upload$/);
  await page.unrouteAll();
  await page.route(API, (route) => route.abort("connectionrefused"));
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Can't reach the Detectra server");
});
test("independent reveal, hide, verification and confidence", async ({ page }) => {
  await results_(page);
  await expect(page.getByText("Model yolo11n-test", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Lizard\s*detected/ })).toBeVisible();
  // Highest confidence first
  await expect(page.getByRole("group", { name: "Detection 1", exact: true })).toContainText("94.8%");
  await expect(page.getByRole("group", { name: "Detection 2", exact: true })).toContainText("86.1%");
  for (const id of [1, 2]) await expect(page.getByTestId(`detection-box-${id}`)).toHaveAttribute("data-revealed", "false");
  await page.getByRole("button", { name: "Reveal detection 1", exact: true }).click();
  await expect(page.getByTestId("detection-box-1")).toHaveAttribute("data-revealed", "true");
  await expect(page.getByTestId("detection-box-2")).toHaveAttribute("data-revealed", "false");
  await page.getByRole("group", { name: "Detection 1", exact: true }).getByRole("button", { name: "Correct", exact: true }).click();
  await page.getByRole("button", { name: "Hide detection 1", exact: true }).click();
  await expect(page.getByTestId("detection-box-1")).toHaveAttribute("data-revealed", "false");
  await page.getByRole("button", { name: "Reveal detection 2", exact: true }).click();
  await page.getByRole("group", { name: "Detection 2", exact: true }).getByRole("button", { name: "Incorrect", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked correct" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Marked incorrect" })).toBeVisible();
  await page.getByRole("button", { name: "Hide detection 2", exact: true }).click();
  await expect(page.getByTestId("detection-box-2")).toHaveAttribute("data-revealed", "false");
  await page.getByRole("link", { name: "Analyze another image" }).click();
  await expect(page).toHaveURL(/\/upload$/);
});
for (const verdict of ["Correct", "Incorrect"]) test(`no detection feedback: ${verdict}`, async ({ page }) => {
  await mockApi(page, { analyzeImageId: "img-empty" });
  await upload(page);
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Nothing\s*detected/ })).toBeVisible();
  await expect(page.getByTestId("detection-box-1")).toHaveCount(0);
  await page.getByRole("button", { name: verdict, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(`Marked ${verdict.toLowerCase()} (not saved yet)`);
});
test("results load from the server by id and survive a refresh", async ({ page }) => {
  await page.goto("/results");
  await expect(page.getByRole("heading", { name: "No image selected" })).toBeVisible();
  await page.goto("/results?image=missing");
  await expect(page.getByRole("heading", { name: "Result not found" })).toBeVisible();
  await results_(page);
  await page.reload();
  await expect(page.getByRole("group", { name: "Detection 1", exact: true })).toContainText("94.8%");
});
test("camera: none configured, then server unreachable", async ({ page }) => {
  await page.goto("/camera");
  await expect(page.getByRole("heading", { name: "No camera configured" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan now", exact: true })).toBeDisabled();
  await mockApi(page, { live: "offline" });
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(page.getByRole("heading", { name: "Can't reach Detectra" })).toBeVisible();
});
test("camera: live view, current detections, recent captures and scan now", async ({ page }) => {
  await mockApi(page, { live: [liveCamera] });
  await page.goto("/camera");
  await expect(page.getByText("Live · Analyzing every frame")).toBeVisible();
  await expect(page.getByRole("img", { name: /Live view of Backyard/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Current detections" })).toContainText("Lizard");
  await expect(page.getByText("1920 × 1080")).toBeVisible();
  await expect(page.getByRole("link", { name: /1 detection/ })).toBeVisible();
  await page.getByRole("button", { name: "Scan now", exact: true }).click();
  await expect(page).toHaveURL(/\/results\?image=img-cam$/);
  await expect(page.getByText(/Camera frame/)).toBeVisible();
});
test("model picker shows the active model and switches it", async ({ page }) => {
  await page.goto("/");
  const mobile = test.info().project.name.startsWith("mobile");
  const picker = page.locator(mobile ? "#model-picker-mobile" : "#model-picker-sidebar");
  await expect(picker).toHaveValue("yolo11n-test");
  await expect(page.getByText("Detecting: Lizards")).toBeVisible();
  const switched = page.waitForRequest((r) => r.url().endsWith("/detector") && r.method() === "PUT");
  await picker.selectOption({ label: "Dogs" });
  expect(JSON.parse((await switched).postData() ?? "{}")).toEqual({ version: "dog-test" });
  await expect(picker).toHaveValue("dog-test");
  await expect(page.getByText("Detecting: Dogs")).toBeVisible();
  await expect(picker.locator("xpath=..").getByText("Detects: Dog")).toBeVisible();
});
test("guide includes six steps and working links", async ({ page }) => {
  await page.goto("/how-to-use");
  const steps = ["Choose a Detection Method", "Submit or Capture an Image", "Review Detection Results", "Reveal Hidden Detections", "Verify Predictions", "Analyze Again"];
  for (const step of steps) await expect(page.getByRole("heading", { name: step, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Upload an image", exact: true }).click();
  await expect(page).toHaveURL(/\/upload$/);
  await page.goBack(); await page.getByRole("link", { name: "Try camera scan" }).click();
  await expect(page).toHaveURL(/\/camera$/);
});
test("routes fit viewport, load without runtime errors or browser credentials", async ({ page }) => {
  await mockApi(page, { live: [liveCamera] });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  for (const route of ["/", "/upload", "/camera", "/how-to-use", "/results", "/results?image=img-1"]) {
    const response = await page.goto(route); expect(response?.status()).toBe(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.content()).not.toMatch(/rtsp:\/\//i);
  }
  const scripts = await page.locator("script[src]").evaluateAll(nodes => nodes.map(n => (n as HTMLScriptElement).src));
  for (const src of scripts) expect(await (await page.request.get(src)).text()).not.toMatch(/rtsps?:\/\/[^\s"']+/i);
  expect(errors).toEqual([]);
});

test("narrow phone and tablet layouts fit all routes including results", async ({ page }) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/upload", "/camera", "/how-to-use"]) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await results_(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Return home", exact: true }).click();
    await expect(page).toHaveURL("/");
  }
});
