import type {
  ApiError, ApiResponse, Capture, CameraScanRequest, DetectionResult, DetectorModel, ImageAnalysisRequest, LiveCamera,
  Reviewer, VerificationRequest,
} from "@/types/detection";

/** Browser transport to the fixed Next.js API routes; the browser never calls FastAPI directly. */
export interface DetectionService {
  health(): Promise<ApiResponse<{ status: "ok" }>>;
  analyzeImage(request: ImageAnalysisRequest): Promise<ApiResponse<DetectionResult>>;
  /** A saved result by image id (uploads and camera frames). */
  result(imageId: string): Promise<ApiResponse<DetectionResult>>;
  liveCameras(): Promise<ApiResponse<LiveCamera[]>>;
  scanCamera(request: CameraScanRequest): Promise<ApiResponse<DetectionResult>>;
  captures(cameraId: string): Promise<ApiResponse<Capture[]>>;
  detectorModels(): Promise<ApiResponse<DetectorModel[]>>;
  selectDetectorModel(version: string): Promise<ApiResponse<DetectorModel>>;
  selectClasses(version: string, classes: string[]): Promise<ApiResponse<DetectorModel>>;
  verify(request: VerificationRequest): Promise<ApiResponse<{ verificationId: string }>>;
  reviewers(): Promise<ApiResponse<Reviewer[]>>;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isResult(value: unknown): value is DetectionResult {
  return record(value) && typeof value.id === "string" && record(value.image)
    && typeof value.image.url === "string" && typeof value.image.name === "string"
    && typeof value.simulated === "boolean" && Array.isArray(value.detections);
}
const isCamera = (value: unknown): value is LiveCamera =>
  record(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.connected === "boolean" && Array.isArray(value.detections);
const isModel = (value: unknown): value is DetectorModel =>
  record(value) && typeof value.version === "string" && typeof value.title === "string" && Array.isArray(value.classes) && typeof value.active === "boolean";
const segment = (id: string) => encodeURIComponent(id);

export const detectionService: DetectionService = {
  async health() { return call("health", (value): value is { status: "ok" } => record(value) && value.status === "ok"); },
  async analyzeImage({ image }) {
    const form = new FormData(); form.set("image", image);
    return call("analyze", isResult, { method: "POST", body: form });
  },
  async result(imageId) { return call(`results/${segment(imageId)}`, isResult); },
  async liveCameras() { return call("live", (value): value is LiveCamera[] => Array.isArray(value) && value.every(isCamera)); },
  async scanCamera({ cameraId }) { return call(`live/${segment(cameraId)}/scan`, isResult, { method: "POST" }); },
  async captures(cameraId) {
    return call(`live/${segment(cameraId)}/captures`, (value): value is Capture[] =>
      Array.isArray(value) && value.every((c) => record(c) && typeof c.id === "string" && typeof c.capturedAt === "string" && typeof c.detections === "number"));
  },
  async detectorModels() { return call("detector", (value): value is DetectorModel[] => Array.isArray(value) && value.every(isModel)); },
  async selectDetectorModel(version) {
    return call("detector", isModel, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version }) });
  },
  async selectClasses(version, classes) {
    return call("detector", isModel, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version, classes }) });
  },
  async verify(request) {
    return call("verify", (value): value is { verificationId: string } => record(value) && typeof value.verificationId === "string", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
    });
  },
  async reviewers() {
    return call("reviewers", (value): value is Reviewer[] => Array.isArray(value) && value.every(row => record(row) && typeof row.id === "string" && typeof row.name === "string"));
  },
};

/** The analyzed MJPEG stream for an <img> src, served through the Next.js proxy. */
export const liveVideoUrl = (cameraId: string) => `/api/detectra/live/${segment(cameraId)}/video`;
export const percent = (score: number) => `${(score * 100).toFixed(1)}%`;
export const titleCase = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);

async function call<T>(path: string, validate: (value: unknown) => value is T, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`/api/detectra/${path}`, { ...init, signal: AbortSignal.timeout(35000) });
    const result: unknown = await response.json();
    if (response.ok && record(result) && result.ok === true && validate(result.data)) return { ok: true, data: result.data };
    if (record(result) && result.ok === false && record(result.error) && typeof result.error.message === "string") {
      const code = result.error.code;
      const error: ApiError = {
        code: code === "connection" || code === "unavailable" || code === "invalid-input" ? code : "unknown",
        message: result.error.message, retryable: result.error.retryable === true,
      };
      return { ok: false, error };
    }
    throw new Error("HTTP status and response envelope do not match, or data is missing");
  } catch {
    return { ok: false, error: { code: "connection", message: "Request not confirmed. Check the backend before retrying.", retryable: false } };
  }
}
