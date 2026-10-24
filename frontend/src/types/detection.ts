/** Internal frontend models, not an agreed FastAPI wire format. */
export type Verification = "correct" | "incorrect";
export type Scenario = "detected" | "none";
export type ImageSource = { url: string; name: string; origin: "upload" | "camera-demo" };
/** Coordinates normalized to the full, uncropped image; values in [0, 1]. */
export type BoundingBox = { x: number; y: number; width: number; height: number };
export type ConfidenceScore = number; // Fraction in [0, 1], validated by the server adapter.
export type Detection = { id: string; label: "lizard"; confidence: ConfidenceScore; box: BoundingBox };
export type DetectionResult = { id: string; image: ImageSource; simulated: boolean; mode?: "backend" | "local-demo"; modelVersion?: string; detections: Detection[] };
export type ImageAnalysisRequest = { image: File };
export type CameraScanRequest = { cameraId: string }; // Opaque backend identifier only.
export type VerificationRequest = { resultId: string; detectionId?: string; verdict: Verification; reviewerId?: string };
export type ApiError = { code: "unavailable" | "connection" | "invalid-input" | "unknown"; message: string; retryable: boolean };
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export type CameraStatus = { state: "unavailable" | "connected"; label: string };

export type Reviewer = { id: string; name: string };
