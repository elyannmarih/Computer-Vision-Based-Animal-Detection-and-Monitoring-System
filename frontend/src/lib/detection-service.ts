import type { AnalysisResult, ApiError, ApiResponse, DetectionRecord, DetectorModel, ImageRecord, LiveCamera } from "@/types/detection";

/** FastAPI base URL; set NEXT_PUBLIC_API_URL when the backend isn't on the default port. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  } catch {
    return { ok: false, error: { code: "connection", message: "Can't reach the Detectra server. Check that it's running and try again.", retryable: true } };
  }
  if (response.ok) return { ok: true, data: (await response.json()) as T };
  const detail = await response.json().then((body) => body?.detail, () => null);
  const code: ApiError["code"] = response.status === 404 ? "not-found" : response.status < 500 ? "invalid-input" : "unknown";
  return {
    ok: false,
    error: { code, message: typeof detail === "string" ? detail : `The server returned an error (${response.status}).`, retryable: response.status >= 500 },
  };
}

export const detectionService = {
  /** Upload an image; the server runs the active model and saves the image and its detections. */
  analyzeImage(image: File) {
    const body = new FormData();
    body.append("image", image);
    return request<AnalysisResult>("/analyze", { method: "POST", body });
  },

  /** A saved image with its detections and the model version that produced them. */
  async getResult(imageId: string): Promise<ApiResponse<AnalysisResult>> {
    const [image, detections] = await Promise.all([
      request<ImageRecord>(`/images/${encodeURIComponent(imageId)}`),
      request<DetectionRecord[]>(`/detections?image_id=${encodeURIComponent(imageId)}&limit=500`),
    ]);
    if (!image.ok) return image;
    if (!detections.ok) return detections;
    const modelId = detections.data.find((d) => d.model_id)?.model_id;
    const model = modelId ? await request<{ version_number: string }>(`/models/${modelId}`) : null;
    const sorted = [...detections.data].sort((a, b) => b.confidence - a.confidence);
    return { ok: true, data: { image: image.data, detections: sorted, model_version: model?.ok ? model.data.version_number : null } };
  },

  liveCameras: () => request<LiveCamera[]>("/live"),
  liveCamera: (cameraId: string) => request<LiveCamera>(`/live/${cameraId}`),
  /** MJPEG stream of the analyzed frames with boxes drawn; use as an <img> src. */
  liveVideoUrl: (cameraId: string) => `${API_URL}/live/${cameraId}/video`,
  /** Save the camera's current frame and its detections, like an upload. */
  scanCamera: (cameraId: string) => request<AnalysisResult>(`/live/${cameraId}/scan`, { method: "POST" }),
  recentCaptures: (cameraId: string, limit = 6) => request<ImageRecord[]>(`/images?camera_id=${cameraId}&limit=${limit}`),

  /** Detector models on the server, with the one in use marked active. */
  detectorModels: () => request<DetectorModel[]>("/detector"),
  /** Switch the model used for uploads and live cameras; the server remembers it across restarts. */
  selectDetectorModel: (version: string) =>
    request<DetectorModel>("/detector", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    }),
};

export const percent = (score: number) => `${(score * 100).toFixed(1)}%`;
export const titleCase = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);
