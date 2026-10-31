
"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { detectionService } from "@/lib/detection-service";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectionRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  const router = useRouter();

  async function analyze() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    const response = await detectionService.analyzeImage(file);
    if (!response.ok) {
      setError(response.error.message);
      setBusy(false);
      return;
    }
    router.push(`/results?image=${response.data.image.image_id}`);
  }

  useEffect(() => {
    return () => {
      selectionRef.current += 1;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  function clearPreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setFile(null);
    setPreview(null);
    setError("");
    selectionRef.current += 1;
  }

  async function selectImage(selected?: File) {
    setError("");
    selectionRef.current += 1;

    if (!selected) return;

    if (!ALLOWED_TYPES.has(selected.type)) {
      setError("Please select a JPG, PNG, or WEBP image.");
      return;
    }

    if (selected.size > MAX_SIZE) {
      setError("Image size must not exceed 10 MB.");
      return;
    }

    clearPreview();

    const selection = selectionRef.current;
    try {
      const bitmap = await createImageBitmap(selected);
      bitmap.close();
    } catch {
      if (selection === selectionRef.current) setError("This image could not be opened. Choose a valid image.");
      return;
    }
    if (selection !== selectionRef.current) return;
    const url = URL.createObjectURL(selected);
    objectUrlRef.current = url;

    setFile(selected);
    setPreview(url);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectImage(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    selectImage(event.dataTransfer.files[0]);
  }

  return (
    <main className="mx-auto max-w-[1222px] px-6 pb-[72px] pt-[70px] md:px-[86px]">
      <div className="grid gap-4 md:grid-cols-[210px_1fr]">
        <p className="pt-[10px] font-mono text-[10px] uppercase tracking-[1px] text-[#8a8a84]">
          Image analysis
        </p>

        <div>
          <h1 className="text-[clamp(36px,4vw,56px)] leading-none tracking-[-0.055em]">
            Upload an image
          </h1>
          <p className="mt-[17px] text-[13px] text-[#747470]">
            Choose a photo. Detectra runs the detection model on it and saves the image and its results.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        disabled={busy}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Select an image"
      />

      <section aria-busy={busy} className="mt-9 rounded-[14px] border border-[#deded9] bg-white p-4">
        {preview ? (
          <div className="relative h-[365px] overflow-hidden rounded-[9px] bg-[#fafaf8]">
            <Image
              src={preview}
              alt={`Preview of ${file?.name ?? "selected image"}`}
              fill
              unoptimized
              className="object-contain"
            />

            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-lg bg-black/80 p-3 text-white backdrop-blur-sm">
              <div className="min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-wide text-white/60">
                  Ready to analyze
                </p>
                <p className="mt-1 truncate text-xs">{file?.name}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={clearPreview}
                aria-label="Remove image"
                className="rounded-md border border-white/30 p-2 hover:bg-white/20"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex h-[365px] cursor-pointer flex-col items-center justify-center rounded-[9px] border border-dashed text-center transition-colors ${
              dragging
                ? "border-[#171717] bg-[#efefec]"
                : "border-[#c8c8c1] bg-[#fafaf8] hover:bg-[#f6f6f4]"
            }`}
          >
            <span className="mb-[19px] flex h-12 w-12 items-center justify-center rounded-full border border-[#d5d5d0] bg-white">
              <Upload size={24} strokeWidth={1.6} />
            </span>
            <p className="text-base font-medium tracking-tight">
              Drop your image here
            </p>
            <p className="mt-[5px] text-xs text-[#747470]">
              or <span className="text-[#171717] underline">browse from your device</span>
            </p>
            <p className="mt-[17px] text-[10px] text-[#aaa]">
              JPG, PNG or WEBP · Maximum 10 MB
            </p>
          </div>
        )}

        {preview && <button disabled={busy} type="button" onClick={() => inputRef.current?.click()} className="mt-3 rounded-lg border border-[#deded9] px-4 py-2 text-xs">Replace image</button>}
        <div className="flex min-h-[80px] flex-wrap items-center justify-between gap-4 px-1 pt-4">
          <p className="text-[10px] text-[#747470]">
            Analyzed images and their detections are saved to Detectra.
          </p>

          
        <button
          type="button"
          disabled={!file || busy}
          onClick={analyze}
          className="rounded-lg bg-[#171717] px-4 py-3 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Analyzing…" : "Analyze image"}
        </button>

        </div>
      </section>

      {busy && <p role="status" className="mt-3 text-xs text-[#747470]">Running the detection model and saving the results…</p>}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-[30px] grid gap-6 border-t border-[#deded9] pt-[22px] sm:grid-cols-3">
        {[
          ["01", "Use a clear image", "Avoid heavy blur or very dark photos."],
          ["02", "Supported formats", "Upload JPG, PNG, or WEBP files."],
          ["03", "Saved results", "Each analysis is stored so it can be reviewed later."],
        ].map(([number, title, description]) => (
          <div key={number}>
            <p className="font-mono text-[9px] text-[#aaa]">{number}</p>
            <h2 className="mt-[14px] text-[11px] font-medium">{title}</h2>
            <p className="mt-[6px] text-[10px] text-[#747470]">
              {description}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
