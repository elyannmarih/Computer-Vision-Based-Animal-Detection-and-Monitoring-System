"use client";

import { useCallback, useEffect, useState } from "react";
import { detectionService, titleCase } from "@/lib/detection-service";
import type { DetectorModel } from "@/types/detection";

/** The server's detector models and the one in use, shared by the sidebar picker and the header badge. */
export function useDetectorModels() {
  const [models, setModels] = useState<DetectorModel[] | null>(null);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);

  const apply = useCallback((response: Awaited<ReturnType<typeof detectionService.detectorModels>>) => {
    if (response.ok) {
      setModels(response.data);
      setError("");
    } else {
      setError(response.error.message);
    }
  }, []);
  const refresh = async () => apply(await detectionService.detectorModels());

  useEffect(() => {
    let current = true;
    detectionService.detectorModels().then((response) => current && apply(response));
    return () => {
      current = false;
    };
  }, [apply]);

  async function select(version: string) {
    setSwitching(true);
    setError("");
    const response = await detectionService.selectDetectorModel(version);
    if (!response.ok) setError(response.error.message);
    await refresh();
    setSwitching(false);
  }

  return { models, active: models?.find((m) => m.active) ?? null, error, switching, select };
}

type Props = ReturnType<typeof useDetectorModels> & { id: string };

export default function ModelPicker({ id, models, active, error, switching, select }: Props) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-medium">Detection model</label>
      <select
        id={id}
        value={active?.version ?? ""}
        disabled={!models || switching}
        onChange={(event) => select(event.target.value)}
        className="mt-2 w-full rounded-md border border-[#deded9] bg-white px-2 py-2 text-xs disabled:opacity-50"
      >
        {!models && <option value="">{error ? "Unavailable" : "Loading…"}</option>}
        {models && !active && <option value="">Stub (no model)</option>}
        {models?.map((m) => (
          <option key={m.version} value={m.version}>{m.title}</option>
        ))}
      </select>
      <p role={error ? "alert" : undefined} aria-live="polite" className={`mt-1 text-[11px] ${error ? "text-red-700" : "text-[#969691]"}`}>
        {error || (switching ? "Switching…" : active ? `Detects: ${active.classes.map(titleCase).join(", ")}` : "")}
      </p>
    </div>
  );
}
