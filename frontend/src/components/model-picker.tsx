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

  async function selectClasses(classes: string[]) {
    const active = models?.find((m) => m.active);
    if (!active || switching) return;
    setSwitching(true);
    setError("");
    const response = await detectionService.selectClasses(active.version, classes);
    if (response.ok) setModels((current) => current?.map((m) => m.version === response.data.version ? response.data : m) ?? null);
    else setError(response.error.message);
    setSwitching(false);
  }

  return { models, active: models?.find((m) => m.active) ?? null, error, switching, select, selectClasses };
}

type Props = ReturnType<typeof useDetectorModels> & { id: string };

export default function ModelPicker({ id, models, active, error, switching, select, selectClasses }: Props) {
  const selected = active?.selectedClasses ?? active?.classes ?? [];
  return (
    <div>
      <fieldset disabled={!active || switching} className="text-xs">
        <legend className="text-[11px] font-medium">Detect species</legend>
        <p className="my-2 text-[11px] text-[#747470]">Choose one or more. Applies to live video and new scans/uploads for all viewers.</p>
        {active && <>
          <label className="flex items-center gap-2 py-1 font-medium">
            <input type="checkbox" checked={selected.length === active.classes.length}
              disabled={selected.length === active.classes.length}
              onChange={() => selectClasses(active.classes)} /> All supported classes
          </label>
          <div className="max-h-36 overflow-y-auto">
            {active.classes.map((name) => <label key={name} className="flex items-center gap-2 py-1">
              <input type="checkbox" checked={selected.includes(name)}
                disabled={selected.length === 1 && selected.includes(name)}
                onChange={() => selectClasses(selected.includes(name) ? selected.filter((c) => c !== name) : [...selected, name])} />
              {titleCase(name)}
            </label>)}
          </div>
        </>}
      </fieldset>
      <details className="mt-3">
      <summary className="cursor-pointer text-[11px] text-[#747470]">Advanced: detection model</summary>
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
      </details>
      <p role={error ? "alert" : undefined} aria-live="polite" className={`mt-1 text-[11px] ${error ? "text-red-700" : "text-[#969691]"}`}>
        {error || (switching ? "Applying…" : active ? `${selected.length} selected · ${active.title}` : "Loading detector…")}
      </p>
    </div>
  );
}
