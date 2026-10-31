import { analysisResult, backendFetch, backendFailure, failure, IMAGE_TYPES, MAX_IMAGE_SIZE } from "@/lib/backend-server";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > MAX_IMAGE_SIZE + 65536) return failure("Image size must not exceed 10 MB.", 413, "invalid-input");
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || !IMAGE_TYPES.has(image.type)) return failure("Please upload a JPG, PNG, or WEBP image.", 415, "invalid-input");
    if (!image.size || image.size > MAX_IMAGE_SIZE) return failure("Image size must be between 1 byte and 10 MB.", 413, "invalid-input");
    const upload = new FormData(); upload.set("image", image);
    const response = await backendFetch("/analyze", { method: "POST", body: upload });
    if (!response.ok) return backendFailure(response.status);
    const data = analysisResult(await response.json(), image.name);
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure("Could not complete the backend request. Check that FastAPI is running, then try again. If submission may have completed, check the backend before retrying.", 502);
  }
}
