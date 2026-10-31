import { backendFetch, failure, IMAGE_PATH_PATTERN, MAX_IMAGE_SIZE } from "@/lib/backend-server";
export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/");
  if (!IMAGE_PATH_PATTERN.test(path)) return failure("Image not found.", 404, "invalid-input");
  try {
    const response = await backendFetch(`/uploads/${path}`);
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(type)) return failure("Image unavailable.", 404);
    const data = await response.arrayBuffer();
    if (data.byteLength > MAX_IMAGE_SIZE) return failure("Image unavailable.", 502);
    return new Response(data, { headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return failure("Image unavailable. Check the backend.", 502); }
}
