import { backendFetch, backendFailure, capture, failure, ok, UUID_PATTERN } from "@/lib/backend-server";
/** The camera's most recently saved frames. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return failure("Camera not found.", 404, "invalid-input");
  try {
    const response = await backendFetch(`/images?camera_id=${id}&limit=6`);
    if (!response.ok) return backendFailure(response.status);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid captures");
    return ok(rows.map(capture));
  } catch { return failure("Could not load recent captures.", 502); }
}
