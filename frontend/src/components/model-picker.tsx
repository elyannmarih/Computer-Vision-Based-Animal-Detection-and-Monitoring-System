"use client";

import { useCallback, useEffect, useState } from "react";
import { detectionService, titleCase } from "@/lib/detection-service";
import type { DetectorModel } from "@/types/detection";

/** Detector configuration used by the settings page. */
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
  useEffect(() => {
    let current = true;
    detectionService.detectorModels().then((response) => current && apply(response));
    return () => {
      current = false;
    };
  }, [apply]);

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

  return { models, active: models?.find((m) => m.active) ?? null, error, switching, selectClasses };
}

type Props = ReturnType<typeof useDetectorModels>;

export default function SpeciesPicker({ active, error, switching, selectClasses }: Props) {
  const selected = active?.selectedClasses ?? active?.classes ?? [];
  const summary = active && selected.length === active.classes.length ? "All supported animals and people" : selected.length ? selected.map(titleCase).join(", ") : "None selected";
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-base font-medium">Detection preferences</h2>
        <p className="mt-2 text-sm text-[#747470]">Choose what to look for in your camera and images.</p>
      </div>
      <details className="group rounded-xl border border-[#deded9] bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <span className="block text-xs text-[#747470]">Animals and people</span>
            <span className="mt-1 block text-sm font-medium">{active ? summary : "Loading preferences..."}</span>
          </div>
          <span className="shrink-0 text-xs text-[#747470] group-open:hidden">Edit</span>
          <span className="hidden shrink-0 text-xs text-[#747470] group-open:inline">Close</span>
        </summary>
        {active && <fieldset disabled={switching} className="border-t border-[#e9e9e5] px-5 pb-5 pt-4">
          <legend className="sr-only">Select detection targets</legend>
          <div className="mb-4 flex items-center justify-between text-xs">
            <span className="text-[#747470]">Detection targets</span>
            <div className="flex gap-4"><button type="button" onClick={() => selectClasses([])} disabled={!selected.length} className="underline underline-offset-4 disabled:opacity-40">Deselect all</button>
            <button type="button" onClick={() => selectClasses(active.classes)} disabled={selected.length === active.classes.length} className="underline underline-offset-4 disabled:opacity-40">Select all</button></div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {active.classes.map((name) => <label key={name} className="flex cursor-pointer items-center gap-3 py-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#303c32]" checked={selected.includes(name)}
                onChange={() => selectClasses(selected.includes(name) ? selected.filter((c) => c !== name) : [...selected, name])} />
              {titleCase(name)}
            </label>)}
          </div>
        </fieldset>}
      </details>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
