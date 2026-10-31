"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { detectionService } from "@/lib/detection-service";
import type { Reviewer } from "@/types/detection";

export default function ReviewerPanel({ reviewerId, onChange, saving }: { reviewerId: string; onChange: (id: string) => void; saving: boolean }) {
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const requestState = useRef({ operation: 0, inFlight: false });
  const load = useCallback(async () => {
    const state = requestState.current;
    if (state.inFlight) return;
    state.inFlight = true;
    const id = ++state.operation;
    setBusy(true); setError("");
    const response = await detectionService.reviewers();
    if (id !== state.operation) return;
    if (response.ok) setReviewers(response.data);
    else setError(response.error.message);
    setLoaded(true); setBusy(false); state.inFlight = false;
  }, []);
  useEffect(() => {
    const state = requestState.current;
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); state.operation++; state.inFlight = false; };
  }, [load]);
  return <section aria-label="Backend verification" className="mb-4 rounded-lg border border-[#deded9] bg-white p-4 text-xs">
    <label htmlFor="reviewer" className="block font-medium">Reviewer for saved feedback</label>
    <select id="reviewer" disabled={saving || busy} value={reviewerId} onChange={event => onChange(event.target.value)} className="mt-2 max-w-full rounded border border-[#deded9] p-2">
      <option value="">Select an existing prototype reviewer</option>
      {reviewers.map(reviewer => <option key={reviewer.id} value={reviewer.id}>{reviewer.name}</option>)}
    </select>
    <p className="mt-2 text-[#747470]">Use the existing reviewer record that represents you. This selector is not authentication. Feedback is saved to PostgreSQL only after backend confirmation.</p>
    {busy && <p role="status" className="mt-2">Loading reviewers…</p>}
    {loaded && !busy && !reviewers.length && !error && <p className="mt-2">No reviewer available yet. Evan must provide an existing reviewer record before feedback can be saved.</p>}
    {error && <p role="alert" className="mt-2">{error}</p>}
    <button disabled={saving || busy} onClick={load} className="mt-2 underline">{busy ? "Loading reviewers…" : "Reload reviewers"}</button>
  </section>;
}
