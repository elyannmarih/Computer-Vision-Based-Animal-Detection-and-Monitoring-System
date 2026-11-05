import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
const fixture = (extension = "png") => path.join(__dirname, "fixtures", `image.${extension}`);
async function upload(page: Page) {
  await page.goto("/upload");
  await page.getByLabel("Select an image").setInputFiles(fixture());
  await expect(page.getByRole("img", { name: /Preview of/ })).toBeVisible();
}
async function results(page: Page) {
  await upload(page);
  await page.getByRole("button", { name: "Preview demo results" }).click();
  await expect(page.getByRole("heading", { name: "Demo results preview" })).toBeVisible();
}
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
  await expect(page.getByRole("button", { name: "Preview demo results" })).toBeEnabled();
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
  await expect(page.getByRole("button", { name: "Preview demo results" })).toBeDisabled();
});
test("remove, reselect and replace image", async ({ page }) => {
  await upload(page);
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect(page.getByRole("img", { name: /Preview of/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview demo results" })).toBeDisabled();
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
  await expect(page.getByRole("button", { name: "Preview demo results" })).toBeDisabled();
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
test("independent reveal, hide, verification and confidence", async ({ page }) => {
  await results(page);
  await expect(page.getByText("No AI model has analyzed", { exact: false })).toBeVisible();
  await expect(page.getByText("94.8%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("86.1%", { exact: true })).toBeVisible();
  for (const id of [1, 2]) await expect(page.getByTestId(`detection-box-${id}`)).toHaveAttribute("data-revealed", "false");
  await page.getByRole("button", { name: "Reveal detection 1", exact: true }).click();
  await expect(page.getByTestId("detection-box-1")).toHaveAttribute("data-revealed", "true");
  await expect(page.getByTestId("detection-box-2")).toHaveAttribute("data-revealed", "false");
  await page.getByRole("group", { name: "Detection 1", exact: true }).getByRole("button", { name: "Correct", exact: true }).click();
  await page.getByRole("button", { name: "Hide detection 1", exact: true }).click();
  await expect(page.getByTestId("detection-box-1")).toHaveAttribute("data-revealed", "false");
  await page.getByRole("button", { name: "Reveal detection 2", exact: true }).click();
  await page.getByRole("group", { name: "Detection 2", exact: true }).getByRole("button", { name: "Incorrect", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Marked correct" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Marked incorrect" })).toBeVisible();
  await page.getByRole("button", { name: "Hide detection 2", exact: true }).click();
  await expect(page.getByTestId("detection-box-2")).toHaveAttribute("data-revealed", "false");
  await page.getByRole("link", { name: "Analyze another image" }).click();
  await expect(page).toHaveURL(/\/upload$/);
});
for (const verdict of ["Correct", "Incorrect"]) test(`no detection feedback: ${verdict}`, async ({ page }) => {
  await results(page);
  await page.getByLabel("Demo scenario").selectOption("none");
  await expect(page.getByRole("heading", { name: /No lizard detected/i })).toBeVisible();
  await expect(page.getByTestId("detection-box-1")).toHaveCount(0);
  await page.getByRole("button", { name: verdict, exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText(`Marked ${verdict.toLowerCase()} (demo only)`);
  await page.getByLabel("Demo scenario").selectOption("detected");
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0);
});
test("direct results and refresh explain temporary image state", async ({ page }) => {
  await page.goto("/results");
  await expect(page.getByRole("heading", { name: "No image selected" })).toBeVisible();
  await results(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "No image selected" })).toBeVisible();
});
const cameraId = "66666666-6666-4666-8666-666666666666";
const frameId = "77777777-7777-4777-8777-777777777777";
const liveCamera = { id: cameraId, name: "Backyard", connected: true, error: null, width: 1920, height: 1080, fps: 9.5, modelVersion: "dog-yolo11s",
  detections: [{ label: "dog", confidence: 0.73 }], lastSavedAt: null, saveInterval: 30, saveConfidence: 0.5 };
const frameResult = { id: frameId, mode: "backend", modelVersion: "dog-yolo11s", simulated: false, capturedAt: "2026-10-31T16:00:00.000Z",
  image: { url: "/demo/camera-frame.png", name: "Camera frame", origin: "camera" },
  detections: [{ id: "88888888-8888-4888-8888-888888888888", label: "dog", confidence: 0.73, box: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 } }] };
test("camera: none configured, then backend unreachable", async ({ page }) => {
  let reachable = true;
  await page.route("**/api/detectra/live", r => r.fulfill(reachable ? { json: { ok: true, data: [] } } : { status: 503, json: { ok: false, error: { code: "connection", message: "Can't reach the Detectra backend. Start FastAPI and retry." } } }));
  await page.goto("/camera");
  await expect(page.getByRole("heading", { name: "No camera configured" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan now", exact: true })).toBeDisabled();
  reachable = false;
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(page.getByRole("heading", { name: "Can't reach Detectra" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Start FastAPI");
});
test("camera: live view, current detections, recent captures and scan now", async ({ page }) => {
  await page.route("**/api/detectra/live", r => r.fulfill({ json: { ok: true, data: [liveCamera] } }));
  await page.route(`**/api/detectra/live/${cameraId}/video`, r => r.fulfill({ path: fixture() }));
  await page.route(`**/api/detectra/live/${cameraId}/captures`, r => r.fulfill({ json: { ok: true, data: [{ id: frameId, capturedAt: frameResult.capturedAt, detections: 1 }] } }));
  let scans = 0;
  await page.route(`**/api/detectra/live/${cameraId}/scan`, r => { scans++; return r.fulfill({ json: { ok: true, data: frameResult } }); });
  await page.route(`**/api/detectra/results/${frameId}`, r => r.fulfill({ json: { ok: true, data: frameResult } }));
  await page.goto("/camera");
  await expect(page.getByText("Live · Analyzing every frame")).toBeVisible();
  await expect(page.getByRole("img", { name: /Live view of Backyard/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Current detections" })).toContainText("Dog");
  await expect(page.getByText("1920 × 1080")).toBeVisible();
  await expect(page.getByRole("link", { name: /1 detection/ })).toBeVisible();
  await page.getByRole("button", { name: "Scan now", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/results\\?image=${frameId}$`));
  await expect(page.getByText(/Camera frame · .* · 1 detection from dog-yolo11s/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Dog\s*detected/ })).toBeVisible();
  expect(scans).toBe(1);
  // A saved result opened by its link loads from the backend, so it survives a refresh
  await page.reload();
  await expect(page.getByRole("heading", { name: /Dog\s*detected/ })).toBeVisible();
});
test("saved feedback stays on the reviewed detection only", async ({ page }) => {
  const image = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const reviewed = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const open = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const saved = {
    id: image, mode: "backend", simulated: false, modelVersion: "yolo11n-20261024-110930",
    image: { url: "/demo/camera-frame.png", name: "Uploaded image", origin: "upload" },
    detections: [
      { id: reviewed, label: "lizard", confidence: 0.81, box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, review: "correct" },
      { id: open, label: "lizard", confidence: 0.42, box: { x: 0.5, y: 0.4, width: 0.2, height: 0.2 } },
    ],
  };
  await page.route(`**/api/detectra/results/${image}`, r => r.fulfill({ json: { ok: true, data: saved } }));
  await page.goto(`/results?image=${image}`);
  await expect(page.getByRole("heading", { name: /Lizard\s*detected/ })).toBeVisible();
  await expect(page.getByText("81.0%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("42.0%", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Detection 1" }).getByRole("status")).toHaveText("Marked correct (saved to backend)");
  await page.getByRole("button", { name: "Reveal detection 2", exact: true }).click();
  const second = page.getByRole("group", { name: "Detection 2" });
  await expect(second.getByRole("button", { name: "Correct", exact: true })).toBeVisible();
  await expect(second.getByRole("status")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("group", { name: "Detection 1" }).getByRole("status")).toHaveText("Marked correct (saved to backend)");
  await expect(page.getByRole("group", { name: "Detection 2" }).getByRole("status")).toHaveCount(0);
});
test("a saved no-detection review is shown and an unreviewed one is not", async ({ page }) => {
  const reviewed = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const open = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const row = (id: string, review?: "incorrect") => ({
    id, mode: "backend", simulated: false, modelVersion: "yolo11n-20261024-110930",
    image: { url: "/demo/camera-frame.png", name: "Uploaded image", origin: "upload" },
    detections: [], ...(review ? { review } : {}),
  });
  await page.route(`**/api/detectra/results/${reviewed}`, r => r.fulfill({ json: { ok: true, data: row(reviewed, "incorrect") } }));
  await page.route(`**/api/detectra/results/${open}`, r => r.fulfill({ json: { ok: true, data: row(open) } }));
  await page.route("**/api/detectra/reviewers", r => r.fulfill({ json: { ok: true, data: [] } }));
  await page.goto(`/results?image=${reviewed}`);
  await expect(page.getByRole("heading", { name: /Nothing\s*detected/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Marked incorrect (saved to backend)" })).toBeVisible();
  await page.goto(`/results?image=${open}`);
  await expect(page.getByRole("heading", { name: /Nothing\s*detected/ })).toBeVisible();
  await expect(page.getByText("Marked incorrect (saved to backend)")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Correct", exact: true })).toBeDisabled();
});
test("camera shows a reconnecting error and disables scanning", async ({ page }) => {
  await page.route("**/api/detectra/live", r => r.fulfill({ json: { ok: true, data: [{ ...liveCamera, connected: false, error: "Can't open the camera stream; retrying.", detections: [], fps: null, width: null, height: null }] } }));
  await page.route(`**/api/detectra/live/${cameraId}/captures`, r => r.fulfill({ json: { ok: true, data: [] } }));
  await page.goto("/camera");
  await expect(page.getByText("Reconnecting…")).toBeVisible();
  await expect(page.getByText("Can't open the camera stream; retrying.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan now", exact: true })).toBeDisabled();
  expect(await page.content()).not.toMatch(/rtsp:\/\//i);
});
test("results link for a missing image explains the error", async ({ page }) => {
  await page.route("**/api/detectra/results/*", r => r.fulfill({ status: 404, json: { ok: false, error: { code: "invalid-input", message: "This record could not be found. Submit the image again." } } }));
  await page.goto("/results?image=99999999-9999-4999-8999-999999999999");
  await expect(page.getByRole("heading", { name: "Couldn't load this result" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("could not be found");
});
test("settings selects species without exposing a model switch", async ({ page }) => {
  let selectedClasses = ["dog", "lizard"];
  const model = () => ({ version: "yolov8s-oiv7", title: "Animals and people", classes: ["dog", "lizard"], selectedClasses, precision: null, active: true });
  await page.route("**/api/detectra/detector", async route => {
    if (route.request().method() === "PATCH") {
      selectedClasses = route.request().postDataJSON().classes;
      return route.fulfill({ json: { ok: true, data: model() } });
    }
    return route.fulfill({ json: { ok: true, data: [model()] } });
  });
  await page.goto("/settings");
  await expect(page.getByText("All supported animals and people")).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByText("Model options", { exact: true })).toHaveCount(0);
  await page.locator("summary").click();
  await page.getByRole("checkbox", { name: "Dog", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Dog", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Lizard", exact: true })).toBeEnabled();

  expect(selectedClasses).toEqual(["lizard"]);
  await page.getByRole("button", { name: "Deselect all", exact: true }).click();
  await expect(page.getByText("None selected", { exact: true })).toBeVisible();
  expect(selectedClasses).toEqual([]);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Dog", exact: true })).toBeChecked();
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
test("routes fit viewport, load without runtime errors or browser credentials", async ({ context }) => {
  for (const route of ["/", "/upload", "/camera", "/how-to-use", "/results"]) {
    // Isolate page loads so a new document does not cancel the previous page's prefetches.
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    try {
      const response = await page.goto(route); expect(response?.status()).toBe(200);
      await expect(page.getByRole("main")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.content()).not.toMatch(/rtsp:\/\//i);
      const scripts = await page.locator("script[src]").evaluateAll(nodes => nodes.map(n => (n as HTMLScriptElement).src));
      for (const src of scripts) expect(await (await page.request.get(src)).text()).not.toMatch(/rtsps?:\/\/[^\s"']+/i);
      expect(errors, `Runtime errors while loading ${route}`).toEqual([]);
    } finally {
      await page.close();
    }
  }
});

test("narrow phone and tablet layouts fit all routes including results", async ({ page }) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/upload", "/camera", "/how-to-use"]) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await results(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Return home", exact: true }).click();
    await expect(page).toHaveURL("/");
  }
});
