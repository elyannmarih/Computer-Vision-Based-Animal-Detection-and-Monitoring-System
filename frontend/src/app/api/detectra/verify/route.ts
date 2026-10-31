import { backendFetch, backendFailure, failure, UUID_PATTERN } from "@/lib/backend-server";
export async function POST(request: Request) {
  try {
    let body;
    try { body = await request.json(); } catch { return failure("Invalid feedback request.", 400, "invalid-input"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return failure("Invalid feedback request.", 400, "invalid-input");
    if (!UUID_PATTERN.test(body.resultId ?? "") || !UUID_PATTERN.test(body.reviewerId ?? "") || (body.detectionId !== undefined && !UUID_PATTERN.test(body.detectionId)) || !["correct", "incorrect"].includes(body.verdict)) return failure("Choose an existing reviewer and a valid verdict.", 400, "invalid-input");
    const path = body.detectionId ? `/detections/${body.detectionId}/verify` : `/images/${body.resultId}/verify`;
    // Whole-image feedback is used only for the no-detection state: incorrect means a target WAS missed.
    const payload = body.detectionId ? { image_id: body.resultId, verified_by_id: body.reviewerId, verdict: body.verdict } : { verified_by_id: body.reviewerId, target_found: body.verdict === "incorrect" };
    const response = await backendFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) return backendFailure(response.status);
    const saved = await response.json();
    if (typeof saved.verification_id !== "string" || !UUID_PATTERN.test(saved.verification_id) || saved.verified_by_id !== body.reviewerId) throw new Error("Invalid acknowledgement");
    return Response.json({ ok: true, data: { verificationId: saved.verification_id } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return failure("Feedback was not confirmed. Check the backend before retrying to avoid duplicate feedback.", 502); }
}
