import { failure, resultFromRecords, UUID_PATTERN } from "@/lib/backend-server";
/** A saved result by image id, so results pages survive a refresh and camera captures can be opened. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return failure("This record could not be found.", 404, "invalid-input");
  try { return await resultFromRecords(id); }
  catch { return failure("Could not load this result. Check the backend and try again.", 502); }
}
