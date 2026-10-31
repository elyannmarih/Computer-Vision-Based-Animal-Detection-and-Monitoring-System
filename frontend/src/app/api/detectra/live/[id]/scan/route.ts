import { analysisResult, backendFetch, backendFailure, failure, ok, UUID_PATTERN } from "@/lib/backend-server";
/** Save the camera's current frame and its detections, like an upload. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return failure("Camera not found.", 404, "invalid-input");
  try {
    const response = await backendFetch(`/live/${id}/scan`, { method: "POST" });
    if (!response.ok) return backendFailure(response.status);
    return ok(analysisResult(await response.json(), "Camera frame"));
  } catch { return failure("The scan was not confirmed. Check Recent captures before scanning again.", 502); }
}
