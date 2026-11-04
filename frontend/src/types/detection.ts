/** Internal frontend models, not an agreed FastAPI wire format. */
export type Verification = "correct" | "incorrect";
export type Scenario = "detected" | "none";
export type ImageSource = { url: string; name: string; origin: "upload" | "camera" | "camera-demo" };
/** Coordinates normalized to the full, uncropped image; values in [0, 1]. */
export type BoundingBox = { x: number; y: number; width: number; height: number };
export type ConfidenceScore = number; // Fraction in [0, 1], validated by the server adapter.
/** label is the class the model reported, e.g. "lizard", "dog" or "deer". review is set only after feedback was saved. */
export type Detection = { id: string; label: string; confidence: ConfidenceScore; box: BoundingBox; review?: Verification };
export type DetectionResult = {
  id: string; image: ImageSource; simulated: boolean; mode?: "backend" | "local-demo"; modelVersion?: string;
  capturedAt?: string; detections: Detection[];
  /** Whole-image verdict, used when the model found nothing. */
  review?: Verification;
};
export type ImageAnalysisRequest = { image: File };
export type CameraScanRequest = { cameraId: string }; // Opaque backend identifier only.
export type VerificationRequest = { resultId: string; detectionId?: string; verdict: Verification; reviewerId?: string };
export type ApiError = { code: "unavailable" | "connection" | "invalid-input" | "unknown"; message: string; retryable: boolean };
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export type CameraStatus = { state: "unavailable" | "connected"; label: string };

export type Reviewer = { id: string; name: string };

/** A camera the backend is streaming and analyzing frame by frame. */
export type LiveCamera = {
  id: string; name: string; connected: boolean; error: string | null;
  width: number | null; height: number | null; fps: number | null; modelVersion: string | null;
  detections: { label: string; confidence: ConfidenceScore }[];
  lastSavedAt: string | null; saveInterval: number; saveConfidence: number;
};
/** A saved camera frame, for the recent captures list. */
export type Capture = { id: string; capturedAt: string; detections: number };
/** A detector model the backend can switch to. */
export type DetectorModel = { version: string; title: string; classes: string[]; selectedClasses: string[]; precision: number | null; active: boolean };
