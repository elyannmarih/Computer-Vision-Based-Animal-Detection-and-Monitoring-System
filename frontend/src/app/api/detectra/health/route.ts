import { backendFetch, failure } from "@/lib/backend-server";
export async function GET() {
  try {
    const response = await backendFetch("/health");
    if (!response.ok || (await response.json()).status !== "ok") return failure("Backend or database unavailable.", 503);
    return Response.json({ ok: true, data: { status: "ok" } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return failure("Backend unavailable. Start FastAPI and retry.", 503); }
}
