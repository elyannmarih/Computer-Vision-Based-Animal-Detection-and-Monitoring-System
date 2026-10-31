import { backendFetch, backendFailure, failure, UUID_PATTERN } from "@/lib/backend-server";
export async function GET() {
  try {
    const response = await backendFetch("/trusted-persons?limit=500");
    if (!response.ok) return backendFailure(response.status);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid reviewers");
    // Return only the existing record ID and display name; exclude emails, phone numbers and account IDs.
    const data = rows.map((row) => {
      if (typeof row.trusted_person_id !== "string" || !UUID_PATTERN.test(row.trusted_person_id) || typeof row.first_name !== "string" || typeof row.last_name !== "string") throw new Error("Invalid reviewer");
      return { id: row.trusted_person_id, name: `${row.first_name} ${row.last_name}`.trim() };
    });
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch { return failure("Could not load existing reviewers. Retry after checking the backend.", 502); }
}
