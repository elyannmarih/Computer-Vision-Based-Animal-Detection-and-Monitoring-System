"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { detectionService } from "@/lib/detection-service";

export default function BackendStatus() {
  const [status, setStatus] = useState("Checking backend…");
  const [busy, setBusy] = useState(true);
  const requestState = useRef({ operation: 0, inFlight: false });
  const check = useCallback(async () => {
    const state = requestState.current;
    if (state.inFlight) return;
    state.inFlight = true;
    const id = ++state.operation;
    setBusy(true);
    const response = await detectionService.health();
    if (id !== state.operation) return;
    setStatus(response.ok ? "Backend and database reachable" : "Backend unavailable");
    setBusy(false);
    state.inFlight = false;
  }, []);
  useEffect(() => {
    const state = requestState.current;
    // Schedule the same loader used by the button; no separate fetch/error path.
    const timer = setTimeout(() => { void check(); }, 0);
    return () => { clearTimeout(timer); state.operation++; state.inFlight = false; };
  }, [check]);
  return <div className="mt-4 text-[11px] leading-5 text-[#747470]"><p role="status">{status}</p><button disabled={busy} onClick={check} className="underline disabled:opacity-40">{busy ? "Checking backend…" : "Check backend"}</button><p>Connectivity does not verify model accuracy.</p></div>;
}
