"use client";

import SpeciesPicker, { useDetectorModels } from "@/components/model-picker";

export default function SettingsPage() {
  const detector = useDetectorModels();
  return (
    <main className="mx-auto max-w-[800px] px-6 py-12 md:px-12 md:py-16">
      <h1 className="text-3xl font-medium tracking-tight">Settings</h1>
      <section aria-label="Detection preferences" className="mt-8 rounded-2xl border border-[#deded9] bg-white p-6 md:p-8">
        <SpeciesPicker {...detector} />
      </section>
    </main>
  );
}
