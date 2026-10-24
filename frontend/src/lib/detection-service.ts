import type { ApiError, ApiResponse, CameraScanRequest, CameraStatus, DetectionResult, ImageAnalysisRequest, VerificationRequest, Reviewer } from "@/types/detection";

/** Browser transport to the fixed Next.js API routes; camera capture is not integrated yet. */
export interface DetectionService {
  cameraStatus(): Promise<ApiResponse<CameraStatus>>;
  health(): Promise<ApiResponse<{ status: "ok" }>>;
  analyzeImage(request: ImageAnalysisRequest): Promise<ApiResponse<DetectionResult>>;
  scanCamera(request: CameraScanRequest): Promise<ApiResponse<DetectionResult>>;
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
const unavailable = <T>(): ApiResponse<T> => ({ ok: false, error: { code: "unavailable", message: "Camera integration pending. No camera image was analyzed.", retryable: false } });
export const detectionService: DetectionService = {
  async cameraStatus() { return { ok: true, data: { state: "unavailable", label: "Integration pending" } }; },
  async health() { return call("health", (value): value is { status: "ok" } => record(value) && value.status === "ok"); },
  async analyzeImage({ image }) {
    const form = new FormData(); form.set("image", image);
    return call("analyze", isResult, { method: "POST", body: form });
  },
  async scanCamera() { return unavailable(); },
  async verify(request) {
    return call("verify", (value): value is { verificationId: string } => record(value) && typeof value.verificationId === "string", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
    });
  },
  async reviewers() {
    return call("reviewers", (value): value is Reviewer[] => Array.isArray(value) && value.every(row => record(row) && typeof row.id === "string" && typeof row.name === "string"));
  },
};

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
