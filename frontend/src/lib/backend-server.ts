/** Server-only FastAPI adapter. Never import this module from a client component. */
import "server-only";
import type { DetectionResult } from "@/types/detection";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const IMAGE_PATH_PATTERN = /^images\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{32}\.(jpg|png|webp)$/;
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
  };
  return failure(messages[status] ?? "The backend could not complete this request. Please try again.", status >= 500 ? 502 : status, status < 500 ? "invalid-input" : "connection");
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
export function analysisResult(value: unknown, name: string): DetectionResult {
  const data = record(value), image = record(data.image);
  const imageId = id(image.image_id);
  if (typeof image.image_url !== "string" || typeof data.model_version !== "string" || !data.model_version) throw new Error("Incomplete result");
  const url = new URL(image.image_url);
  const path = url.pathname.replace(/^\/uploads\//, "");
  // Current integration supports Evan's default local storage. Do not proxy arbitrary URLs.
  if (url.origin !== apiBase().origin || !url.pathname.startsWith("/uploads/") || !IMAGE_PATH_PATTERN.test(path)) throw new Error("Unsupported image storage URL");
  if (!Array.isArray(data.detections)) throw new Error("Missing detections");
  const seen = new Set<string>();
  const detections = data.detections.map((value: unknown) => {
    const d = record(value), detectionId = id(d.detection_id);
    if (d.image_id !== imageId || d.class_label !== "lizard" || seen.has(detectionId)) throw new Error("Unexpected detection");
    seen.add(detectionId);
    const box = { x: unit(d.x_min), y: unit(d.y_min), width: unit(d.width, true), height: unit(d.height, true) };
    if (box.x + box.width > 1.00001 || box.y + box.height > 1.00001) throw new Error("Box outside image");
    return { id: detectionId, label: "lizard" as const, confidence: unit(d.confidence), box };
  });
  return { id: imageId, image: { url: `/api/detectra/images/${path}`, name, origin: "upload" }, mode: "backend", modelVersion: data.model_version,
    simulated: data.model_version.startsWith("stub-"), detections };
}
