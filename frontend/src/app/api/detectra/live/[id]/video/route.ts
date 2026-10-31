import { apiBase, failure, UUID_PATTERN } from "@/lib/backend-server";
/** The analyzed MJPEG stream, passed through as it arrives; it ends when the viewer leaves the page. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return failure("Camera not found.", 404, "invalid-input");
  try {
    const upstream = await fetch(new URL(`/live/${id}/video`, apiBase()), { cache: "no-store", redirect: "error", signal: request.signal });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !upstream.body || !type.startsWith("multipart/x-mixed-replace; boundary=")) return failure("Live video unavailable.", 502);
    return new Response(upstream.body, { headers: { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return failure("Live video unavailable. Check the backend.", 502); }
}
