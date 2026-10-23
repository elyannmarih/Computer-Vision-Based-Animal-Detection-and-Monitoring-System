import type { ApiResponse, CameraScanRequest, CameraStatus, DetectionResult, ImageAnalysisRequest, VerificationRequest } from "@/types/detection";

/** Replace this adapter after Evan confirms endpoints, auth and response schemas. */
export interface DetectionService {
  cameraStatus(): Promise<ApiResponse<CameraStatus>>;
  analyzeImage(request: ImageAnalysisRequest): Promise<ApiResponse<DetectionResult>>;
  scanCamera(request: CameraScanRequest): Promise<ApiResponse<DetectionResult>>;
  verify(request: VerificationRequest): Promise<ApiResponse<void>>;
}
const unavailable = <T>(): ApiResponse<T> => ({ ok: false, error: { code: "unavailable", message: "Backend integration pending. No image was analyzed or feedback stored.", retryable: false } });
export const detectionService: DetectionService = {
  async cameraStatus() { return { ok: true, data: { state: "unavailable", label: "Integration pending" } }; },
  async analyzeImage() { return unavailable(); },
  async scanCamera() { return unavailable(); },
  async verify() { return unavailable(); },
};
