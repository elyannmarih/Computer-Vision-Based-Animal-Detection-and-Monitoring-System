/** FastAPI wire formats (see backend/app/schemas.py). Box values are normalized to the full image, in [0, 1]. */
export type Verification = "correct" | "incorrect";
export type ConfidenceScore = number; // Fraction in [0, 1]

export type ImageRecord = {
  image_id: string;
  camera_id: string | null;
  image_url: string;
  captured_at: string;
  uploaded_at: string | null;
  targets_detected: boolean;
  number_detections: number;
  number_targets_detected: number;
};
export type DetectionRecord = {
  detection_id: string;
  image_id: string;
  model_id: string | null;
  class_label: string;
  confidence: ConfidenceScore;
  x_min: number;
  y_min: number;
  width: number;
  height: number;
};
export type AnalysisResult = { image: ImageRecord; detections: DetectionRecord[]; model_version: string | null };

export type LiveDetection = Pick<DetectionRecord, "class_label" | "confidence" | "x_min" | "y_min" | "width" | "height">;
export type LiveCamera = {
  camera_id: string;
  location_name: string;
  connected: boolean;
  error: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  model_version: string | null;
  detections: LiveDetection[];
  last_frame_at: string | null;
  last_saved_at: string | null;
  save_interval: number;
  save_confidence: number;
};

export type ApiError = { code: "connection" | "invalid-input" | "not-found" | "unknown"; message: string; retryable: boolean };
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };
