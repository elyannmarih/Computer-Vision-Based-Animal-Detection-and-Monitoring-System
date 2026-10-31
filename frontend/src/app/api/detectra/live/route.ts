import { backendFetch, backendFailure, failure, liveCamera, ok } from "@/lib/backend-server";
/** Cameras the backend is streaming; their URLs and credentials are never part of this response. */
export async function GET() {
  try {
    const response = await backendFetch("/live");
    if (!response.ok) return backendFailure(response.status);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid cameras");
    return ok(rows.map(liveCamera));
  } catch { return failure("Can't reach the Detectra backend. Start FastAPI and retry.", 503); }
}
