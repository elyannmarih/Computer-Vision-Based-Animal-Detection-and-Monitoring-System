import { expect, test } from "@playwright/test";
import path from "node:path";

const reviewer = "30000000-0000-0000-0000-000000000001";
const fixture = path.resolve(__dirname, "../../../backend/tests/fixtures/astronaut.png");
const api = "http://127.0.0.1:8102";

test("real upload, bounding boxes and feedback survive a browser reload", async ({ page, request }) => {
  await page.goto("/upload");
  await page.getByLabel("Select an image").setInputFiles(fixture);
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\?image=/);
  await expect(page.getByRole("heading", { name: "Detection results", exact: true })).toBeVisible();
  await expect(page.getByText("Backend model: yolov8s-oiv7.")).toBeVisible();
  await expect(page.getByRole("img", { name: /Selected image:/ })).toBeVisible();
  await expect(page.getByText("Highest confidence")).toBeVisible();
  const imageId = new URL(page.url()).searchParams.get("image");
  const detections = await (await request.get(`${api}/detections?image_id=${imageId}`)).json();
  expect(detections.some((d: { class_label: string }) => d.class_label === "person")).toBe(true);
  expect(detections.length).toBeGreaterThan(0);
  const first = page.getByRole("group", { name: "Detection 1", exact: true });
  await first.getByRole("button", { name: "Reveal detection 1", exact: true }).click();
  await expect(first.getByRole("button", { name: "Hide detection 1", exact: true })).toBeVisible();
  await first.getByRole("button", { name: "Hide detection 1", exact: true }).click();
  await first.getByRole("button", { name: "Reveal detection 1", exact: true }).click();
  await page.getByLabel("Reviewer for saved feedback").selectOption(reviewer);
  await first.getByRole("button", { name: "Correct", exact: true }).click();
  await expect(first.getByText("Marked correct (saved to backend)")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("group", { name: "Detection 1", exact: true }).getByText("Marked correct (saved to backend)")).toBeVisible();
  const image = await (await request.get(`${api}/images/${imageId}`)).json();
  expect(image.number_targets_verified).toBe(1);
});

test("stored negative results and incorrect feedback survive reload", async ({ page, request }) => {
  // Seeded boxes are explicitly fictional; this test exercises feedback persistence.
  const imageId = "50000000-0000-0000-0000-000000000003";
  await page.goto(`/results?image=${imageId}`);
  await page.getByLabel("Reviewer for saved feedback").selectOption(reviewer);
  await page.getByRole("button", { name: "Reveal detection 1", exact: true }).click();
  await page.getByRole("button", { name: "Incorrect", exact: true }).click();
  await expect(page.getByText("Marked incorrect (saved to backend)")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Marked incorrect (saved to backend)")).toBeVisible();
  const image = await (await request.get(`${api}/images/${imageId}`)).json();
  expect(image.human_verified).toBe(true);
  expect(image.number_targets_verified).toBe(0);
  await page.goto("/results?image=50000000-0000-0000-0000-000000000002");
  await expect(page.getByText("No candidates")).toBeVisible();
  await expect(page.getByText("Marked correct (saved to backend)")).toBeVisible();
});

test("real blank upload can be reviewed without inventing detections", async ({ page, request }) => {
  const blank = process.env.DETECTRA_BLANK_FIXTURE;
  if (!blank) throw new Error("The system test runner must supply the blank image fixture.");
  await page.goto("/upload");
  await page.getByLabel("Select an image").setInputFiles(blank);
  await page.getByRole("button", { name: "Analyze image", exact: true }).click();
  await expect(page).toHaveURL(/\/results\?image=/);
  await expect(page.getByText("No candidates")).toBeVisible();
  await page.getByLabel("Reviewer for saved feedback").selectOption(reviewer);
  await page.getByRole("button", { name: "Correct", exact: true }).click();
  await expect(page.getByText("Marked correct (saved to backend)")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Marked correct (saved to backend)")).toBeVisible();
  const imageId = new URL(page.url()).searchParams.get("image");
  const image = await (await request.get(`${api}/images/${imageId}`)).json();
  expect(image.human_verified).toBe(true);
  expect(image.number_detections).toBe(0);
  expect(image.number_targets_verified).toBe(0);
});

test("species preferences persist without changing the model", async ({ page, request }) => {
  await page.goto("/settings");
  await page.getByText("Animals and people", { exact: true }).click();
  const person = page.getByRole("checkbox", { name: "Person", exact: true });
  await expect(person).toBeChecked();
  try {
    const saved = page.waitForResponse(response => response.url().endsWith('/api/detectra/detector') && response.request().method() === 'PATCH');
    await person.click();
    expect((await saved).ok()).toBe(true);
    await expect(person).not.toBeChecked();
    await expect(person).toBeEnabled();
    await page.reload();
    await page.getByText("Animals and people", { exact: true }).click();
    await expect(person).not.toBeChecked();
    const models = await (await request.get(`${api}/detector`)).json();
    expect(models.find((m: { active: boolean }) => m.active).version).toBe("yolov8s-oiv7");
  } finally {
    const models = await (await request.get(`${api}/detector`)).json();
    const active = models.find((m: { active: boolean }) => m.active);
    const restored = await request.patch(`${api}/detector`, { data: { version: active.version, classes: active.classes } });
    expect(restored.ok()).toBe(true);
  }
});

test("local video goes through the live camera and Scan Now workflow", async ({ page, request }) => {
  await page.goto("/camera");
  await expect(page.getByText("Live · Analyzing every frame", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Live view of Local video fixture with detections outlined" })).toBeVisible();
  await page.getByRole("button", { name: "Scan now", exact: true }).click();
  await expect(page).toHaveURL(/\/results\?image=/);
  await expect(page.getByText("Backend model: yolov8s-oiv7.")).toBeVisible();
  const imageId = new URL(page.url()).searchParams.get("image");
  const image = await (await request.get(`${api}/images/${imageId}`)).json();
  expect(image.camera_id).toBeTruthy();
  expect(image.number_detections).toBeGreaterThan(0);
});
