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
  await expect(page.getByRole("heading", { name: "Scan a camera frame" })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Analyze image (unavailable)", exact: true })).toBeDisabled();
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
  await expect(page.getByRole("status").filter({ hasText: "Marked correct" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Marked incorrect" })).toBeVisible();
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
  await expect(page.getByRole("status")).toHaveText(`Marked ${verdict.toLowerCase()} (demo only)`);
  await page.getByLabel("Demo scenario").selectOption("detected");
  await expect(page.getByRole("status")).toHaveCount(0);
});
test("direct results and refresh explain temporary image state", async ({ page }) => {
  await page.goto("/results");
  await expect(page.getByRole("heading", { name: "No image selected" })).toBeVisible();
  await results(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "No image selected" })).toBeVisible();
});
test("camera unavailable, retry, error recovery and demo results", async ({ page }) => {
  await page.goto("/camera");
  await expect(page.getByRole("heading", { name: "Camera unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan now", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(page.getByRole("button", { name: "Checking…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retry connection" })).toBeEnabled();
  await page.getByRole("button", { name: "Simulate connection error" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("simulated connection failure");
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(page.getByRole("heading", { name: "Camera unavailable" })).toBeVisible();
  await page.getByRole("button", { name: "Try camera demo" }).click();
  await expect(page.getByText("Demo still image · No live camera")).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan now", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Preview simulated scan" }).click();
  await expect(page.getByRole("heading", { name: "Demo results preview" })).toBeVisible();
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
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  for (const route of ["/", "/upload", "/camera", "/how-to-use", "/results"]) {
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
    await results(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Return home", exact: true }).click();
    await expect(page).toHaveURL("/");
  }
});
