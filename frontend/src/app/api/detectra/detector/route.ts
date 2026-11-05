import { backendFetch, backendFailure, detectorModel, failure, LABEL_PATTERN, MODEL_VERSION_PATTERN, ok } from "@/lib/backend-server";
/** The detector models on the backend, with the one in use marked active. */
export async function GET() {
  try {
    const response = await backendFetch("/detector");
    if (!response.ok) return backendFailure(response.status);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid models");
    return ok(rows.map(detectorModel));
  } catch { return failure("Could not load detection models. Check the backend.", 502); }
}
/** Switch the model used for uploads and live cameras. */
export async function PUT(request: Request) {
  try {
    let body;
    try { body = await request.json(); } catch { return failure("Invalid model request.", 400, "invalid-input"); }
    if (!body || typeof body.version !== "string" || !MODEL_VERSION_PATTERN.test(body.version)) return failure("Choose one of the listed models.", 400, "invalid-input");
    const response = await backendFetch("/detector", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: body.version }) });
    if (!response.ok) return response.status === 404 ? failure("That model is no longer available. Reload the list.", 404, "invalid-input") : backendFailure(response.status);
    return ok(detectorModel(await response.json()));
  } catch { return failure("The model switch was not confirmed. Reload the list to see which model is active.", 502); }
}

export async function PATCH(request: Request) {
  try {
    let body;
    try { body = await request.json(); } catch { return failure("Invalid species selection.", 400, "invalid-input"); }
    if (!body || typeof body.version !== "string" || !MODEL_VERSION_PATTERN.test(body.version)
      || !Array.isArray(body.classes) || body.classes.length > 100
      || !body.classes.every((c: unknown) => typeof c === "string" && LABEL_PATTERN.test(c))
      || new Set(body.classes).size !== body.classes.length) return failure("Choose supported species.", 400, "invalid-input");
    const response = await backendFetch("/detector", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: body.version, classes: body.classes }) });
    if (!response.ok) return failure("Could not apply species. Reload the detector and try again.", response.status === 422 ? 422 : 502);
    return ok(detectorModel(await response.json()));
  } catch { return failure("Species selection was not confirmed. Reload to check the active selection.", 502); }
}
