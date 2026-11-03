/** Server-only FastAPI adapter. Never import this module from a client component. */
import "server-only";
import type { Capture, DetectionResult, DetectorModel, LiveCamera } from "@/types/detection";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const IMAGE_PATH_PATTERN = /^images\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{32}\.(jpg|png|webp)$/;
/** Class labels and model folder names the backend may report; anything else is rejected. */
export const LABEL_PATTERN = /^[a-z][a-z -]{0,39}$/;
export const MODEL_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
export { MAX_IMAGE_SIZE, IMAGE_TYPES } from "@/lib/image-rules";
export function apiBase() {
  const url = new URL(process.env.API_BASE_URL ?? "http://127.0.0.1:8000");
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("Invalid API configuration");
  return url;
}
export async function backendFetch(path: string, init?: RequestInit) {
  return fetch(new URL(path, apiBase()), { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000) });
}
export function failure(message: string, status: number, code = "connection") {
  return Response.json({ ok: false, error: { code, message, retryable: status >= 500 } }, { status, headers: { "Cache-Control": "no-store" } });
}
export function backendFailure(status: number) {
  // Never forward raw database messages, traces, URLs, or credentials from FastAPI.
  const messages: Record<number, string> = {
    413: "Image size must not exceed 10 MB.", 415: "Please upload a JPG, PNG, or WEBP image.",
    422: "The submitted image or feedback could not be accepted. Check your input.",
    404: "This record could not be found. Submit the image again.",
    409: "The backend could not save this request. Check the reviewer and try again.",
    503: "The camera has no frame yet. Wait for it to connect, then try again.",
  };
  return failure(messages[status] ?? "The backend could not complete this request. Please try again.", status >= 500 ? 502 : status, status < 500 ? "invalid-input" : "connection");
}
export function ok(data: unknown) {
  return Response.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid backend response");
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error("Invalid identifier");
  return value;
}
function unit(value: unknown, positive = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1 || (positive && value === 0)) throw new Error("Invalid coordinate or confidence");
  return value;
}
function label(value: unknown): string {
  if (typeof value !== "string" || !LABEL_PATTERN.test(value)) throw new Error("Unexpected class label");
  return value;
}
function version(value: unknown): string {
  if (typeof value !== "string" || !MODEL_VERSION_PATTERN.test(value)) throw new Error("Invalid model version");
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("Invalid timestamp");
  return new Date(value).toISOString();
}
const optional = <T>(value: unknown, parse: (v: unknown) => T): T | null => (value === null || value === undefined ? null : parse(value));
function storedReview(value: unknown): "correct" | "incorrect" | undefined {
  return value === "correct" || value === "incorrect" ? value : undefined;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error("Invalid count");
  return value;
}

/** An /analyze or /live/{id}/scan result, or a saved image rebuilt by resultFromRecords. model_version may be null
 * for a saved image with no detections, since the model is only recorded on detections. */
export function analysisResult(value: unknown, name: string): DetectionResult {
  const data = record(value), image = record(data.image);
  const imageId = id(image.image_id);
  const modelVersion = optional(data.model_version, version);
  if (typeof image.image_url !== "string" || (modelVersion === null && Array.isArray(data.detections) && data.detections.length)) throw new Error("Incomplete result");
  const url = new URL(image.image_url);
  const path = url.pathname.replace(/^\/uploads\//, "");
  // Current integration supports Evan's default local storage. Do not proxy arbitrary URLs.
  if (url.origin !== apiBase().origin || !url.pathname.startsWith("/uploads/") || !IMAGE_PATH_PATTERN.test(path)) throw new Error("Unsupported image storage URL");
  if (!Array.isArray(data.detections)) throw new Error("Missing detections");
  const seen = new Set<string>();
  const detections = data.detections.map((value: unknown) => {
    const d = record(value), detectionId = id(d.detection_id);
    if (d.image_id !== imageId || seen.has(detectionId)) throw new Error("Unexpected detection");
    seen.add(detectionId);
    const box = { x: unit(d.x_min), y: unit(d.y_min), width: unit(d.width, true), height: unit(d.height, true) };
    if (box.x + box.width > 1.00001 || box.y + box.height > 1.00001) throw new Error("Box outside image");
    // A stored verdict is attached only for a detection the database already marked reviewed.
    const review = d.human_verified === true ? storedReview(d.review) : undefined;
    return { id: detectionId, label: label(d.class_label), confidence: unit(d.confidence), box, ...(review ? { review } : {}) };
  }).sort((a, b) => b.confidence - a.confidence);
  const fromCamera = image.camera_id !== null && image.camera_id !== undefined;
  if (fromCamera) id(image.camera_id);
  const review = !detections.length ? storedReview(data.review) : undefined;
  return {
    id: imageId, image: { url: `/api/detectra/images/${path}`, name, origin: fromCamera ? "camera" : "upload" },
    mode: "backend", modelVersion: modelVersion ?? undefined, simulated: modelVersion?.startsWith("stub-") ?? false,
    capturedAt: optional(image.captured_at, timestamp) ?? undefined, detections, ...(review ? { review } : {}),
  };
}

/** Rebuild a saved result from the images, detections and models tables. */
export async function resultFromRecords(imageId: string): Promise<Response> {
  const [image, detections] = await Promise.all([
    backendFetch(`/images/${imageId}`),
    backendFetch(`/detections?image_id=${imageId}&limit=500`),
  ]);
  if (!image.ok) return backendFailure(image.status);
  if (!detections.ok) return backendFailure(detections.status);
  const rows: unknown = await detections.json();
  if (!Array.isArray(rows)) throw new Error("Invalid detections");
  const modelId = rows.map((r) => record(r).model_id).find((m) => typeof m === "string");
  let modelVersion: string | null = null;
  if (modelId) {
    const model = await backendFetch(`/models/${id(modelId)}`);
    if (model.ok) modelVersion = version(record(await model.json()).version_number);
  }
  const imageRow = record(await image.json());
  const lookups = new Map<string, Promise<boolean | undefined>>();
  const targetFound = (verificationId: unknown) => {
    if (typeof verificationId !== "string" || !UUID_PATTERN.test(verificationId)) return Promise.resolve(undefined);
    let pending = lookups.get(verificationId);
    if (!pending) {
      pending = backendFetch(`/human-verifications/${verificationId}`).then(async (response) => {
        if (!response.ok) return undefined;
        const saved = record(await response.json());
        return typeof saved.target_found === "boolean" ? saved.target_found : undefined;
      }).catch(() => undefined);
      lookups.set(verificationId, pending);
    }
    return pending;
  };
  // Per-detection target_found true means Correct. A whole-image review uses the opposite mapping:
  // target_found true means the "nothing detected" result was Incorrect.
  const enriched = await Promise.all(rows.map(async (value) => {
    const row = record(value);
    if (row.human_verified !== true) return row;
    const found = await targetFound(row.verification_id);
    return found === undefined ? row : { ...row, review: found ? "correct" : "incorrect" };
  }));
  let review: "correct" | "incorrect" | undefined;
  if (!enriched.length && imageRow.human_verified === true) {
    const found = await targetFound(imageRow.verification_id);
    if (found !== undefined) review = found ? "incorrect" : "correct";
  }
  const name = imageRow.camera_id ? "Camera frame" : "Uploaded image";
  return ok(analysisResult({ image: imageRow, detections: enriched, model_version: modelVersion, review }, name));
}

export function liveCamera(value: unknown): LiveCamera {
  const c = record(value);
  if (typeof c.location_name !== "string" || typeof c.connected !== "boolean" || !Array.isArray(c.detections)) throw new Error("Invalid camera");
  const size = (v: unknown) => optional(v, count);
  return {
    id: id(c.camera_id), name: c.location_name.slice(0, 100), connected: c.connected,
    // Camera errors come from Detectra's own fixed messages; still never forward anything URL-like.
    error: typeof c.error === "string" && !/:\/\//.test(c.error) ? c.error.slice(0, 200) : null,
    width: size(c.width), height: size(c.height),
    fps: typeof c.fps === "number" && Number.isFinite(c.fps) && c.fps >= 0 ? c.fps : null,
    modelVersion: optional(c.model_version, version),
    detections: c.detections.map((d) => ({ label: label(record(d).class_label), confidence: unit(record(d).confidence) })),
    lastSavedAt: optional(c.last_saved_at, timestamp),
    saveInterval: typeof c.save_interval === "number" && c.save_interval >= 0 ? c.save_interval : 0,
    saveConfidence: unit(c.save_confidence ?? 0),
  };
}

export function capture(value: unknown): Capture {
  const c = record(value);
  return { id: id(c.image_id), capturedAt: timestamp(c.captured_at), detections: count(c.number_detections) };
}

export function detectorModel(value: unknown): DetectorModel {
  const m = record(value);
  if (typeof m.title !== "string" || !Array.isArray(m.classes) || typeof m.active !== "boolean") throw new Error("Invalid model");
  return {
    version: version(m.version), title: m.title.slice(0, 80), classes: m.classes.map(label),
    precision: optional(m.precision, (v) => unit(v)), active: m.active,
  };
}
