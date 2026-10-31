"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Eye, EyeOff, ImageOff, RotateCcw, X } from "lucide-react";
import { detectionService, percent, titleCase } from "@/lib/detection-service";
import type { AnalysisResult, ApiError, Verification as Feedback } from "@/types/detection";

type Loaded = { id: string; result?: AnalysisResult; error?: ApiError };

export default function ResultsView() {
  const imageId = useSearchParams().get("image");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [imageRatio, setImageRatio] = useState(4 / 3);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [overallFeedback, setOverallFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (!imageId) return;
    let current = true;
    detectionService.getResult(imageId).then((response) => {
      if (!current) return;
      setLoaded(response.ok ? { id: imageId, result: response.data } : { id: imageId, error: response.error });
      setRevealed({});
      setFeedback({});
      setOverallFeedback(null);
    });
    return () => {
      current = false;
    };
  }, [imageId]);

  if (!imageId) {
    return (
      <main className="mx-auto max-w-[1050px] px-6 py-20">
        <h1 className="text-4xl tracking-tight">No image selected</h1>
        <p className="mt-4 text-sm text-[#747470]">Upload an image or scan a camera frame to see detection results.</p>
        <Link href="/upload" className="mt-8 inline-block rounded-lg bg-[#171717] px-5 py-3 text-xs text-white">
          Go to image analysis
        </Link>
      </main>
    );
  }

  if (!loaded || loaded.id !== imageId) {
    return (
      <main className="mx-auto max-w-[1050px] px-6 py-20">
        <p role="status" className="text-sm text-[#747470]">Loading results…</p>
      </main>
    );
  }

  if (!loaded.result) {
    return (
      <main className="mx-auto max-w-[1050px] px-6 py-20">
        <h1 className="text-4xl tracking-tight">{loaded.error?.code === "not-found" ? "Result not found" : "Couldn't load results"}</h1>
        <p role="alert" className="mt-4 text-sm text-[#747470]">
          {loaded.error?.code === "not-found" ? "This image isn't in Detectra. It may have been deleted." : loaded.error?.message}
        </p>
        <Link href="/upload" className="mt-8 inline-block rounded-lg bg-[#171717] px-5 py-3 text-xs text-white">
          Go to image analysis
        </Link>
      </main>
    );
  }

  const { image, detections, model_version } = loaded.result;
  const hasDetections = detections.length > 0;
  const highest = Math.max(0, ...detections.map((d) => d.confidence));
  const labels = [...new Set(detections.map((d) => d.class_label))];
  const source = image.camera_id ? "Camera frame" : "Uploaded image";
  const number = (id: string) => detections.findIndex((d) => d.detection_id === id) + 1;

  return (
    <main className="mx-auto max-w-[1222px] px-6 pb-16 pt-[70px] md:px-[86px]">
      <div className="mb-9 grid gap-4 md:grid-cols-[210px_1fr]">
        <p className="pt-3 font-mono text-[10px] uppercase tracking-[1px] text-[#8a8a84]">Detection results</p>
        <div>
          <h1 className="text-[clamp(36px,4vw,56px)] leading-none tracking-[-0.055em]">Detection results</h1>
          <p className="mt-4 text-[13px] text-[#747470]">
            {source} · {new Date(image.captured_at).toLocaleString()}
            {model_version && <> · Model {model_version}</>}
          </p>
        </div>
      </div>

      <section className="grid overflow-hidden rounded-[14px] border border-[#deded9] bg-white lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex items-center bg-[#efefec] p-4">
          <div className="relative w-full overflow-hidden" style={{ aspectRatio: imageRatio }}>
            <Image
              src={image.image_url}
              alt={`Analyzed ${source.toLowerCase()}`}
              fill
              unoptimized
              onLoad={(event) => setImageRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
              className="object-fill"
            />
            <span className="absolute left-4 top-4 rounded bg-[#171717] px-3 py-2 font-mono text-[9px] uppercase tracking-wide text-white">
              {detections.length} {detections.length === 1 ? "detection" : "detections"}
            </span>
            {detections.map((detection) => {
              const isRevealed = revealed[detection.detection_id];
              const n = number(detection.detection_id);
              return (
                <div
                  key={detection.detection_id}
                  className={`absolute flex items-center justify-center overflow-hidden border ${
                    isRevealed ? "border-2 border-white bg-transparent" : "border-white bg-[#171717]"
                  }`}
                  aria-label={`Detection ${n}: ${isRevealed ? "revealed" : "hidden"}`}
                  data-testid={`detection-box-${n}`}
                  data-revealed={!!isRevealed}
                  style={{
                    left: `${detection.x_min * 100}%`,
                    top: `${detection.y_min * 100}%`,
                    width: `${detection.width * 100}%`,
                    height: `${detection.height * 100}%`,
                  }}
                >
                  {isRevealed ? (
                    <span className="absolute left-0 top-0 bg-white px-2 py-1 font-mono text-[9px] text-[#171717]">
                      #{n}
                      <span className="hidden sm:inline"> · {titleCase(detection.class_label)} · {percent(detection.confidence)}</span>
                    </span>
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-2 text-center text-white">
                      <ImageOff size={19} />
                      <p className="hidden text-[10px] sm:block">Sensitive area hidden</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col p-[26px]">
          <p className="font-mono text-[10px] uppercase tracking-[1px] text-[#8a8a84]">Result / 01</p>
          <div className="mt-7 flex h-10 w-10 items-center justify-center rounded-full border border-[#171717]">
            <Check size={20} strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 text-[38px] leading-[0.95] tracking-[-0.05em]">
            {hasDetections ? (
              <>
                {labels.map(titleCase).join(", ")}
                <br />
                detected
              </>
            ) : (
              <>
                Nothing
                <br />
                detected
              </>
            )}
          </h2>
          <p className="mt-5 text-xs leading-5 text-[#747470]">
            {hasDetections
              ? "Review each highlighted area separately."
              : "The model found nothing in this image. You can verify the result below."}
          </p>

          <div className="my-7 border-y border-[#e9e9e5] py-5">
            <div className="flex items-end justify-between gap-2">
              <p className="text-[11px] text-[#8a8a84]">{hasDetections ? "Highest confidence" : "No candidates"}</p>
              <span className="text-[23px] tracking-tight">{hasDetections ? percent(highest) : "N/A"}</span>
            </div>
            <div className="mt-3 h-[3px] bg-[#e9e9e5]">
              <div className="h-full bg-[#171717]" style={{ width: hasDetections ? percent(highest) : "0%" }} />
            </div>
          </div>

          {hasDetections ? (
            <div>
              <h3 className="text-xs font-medium">Verify each detection</h3>
              <p className="mt-1 text-[11px] text-[#8a8a84]">Review every highlighted area independently.</p>
              <div className="mt-4 space-y-3">
                {detections.map((detection) => {
                  const id = detection.detection_id;
                  const n = number(id);
                  const isRevealed = revealed[id];
                  const choice = feedback[id];
                  return (
                    <div key={id} role="group" aria-label={`Detection ${n}`} className="rounded-lg border border-[#e9e9e5] p-3">
                      <div className="mb-3 flex justify-between text-[11px]">
                        <span className="text-[#747470]">
                          Detection #{n} · {titleCase(detection.class_label)}
                        </span>
                        <span>{percent(detection.confidence)}</span>
                      </div>
                      <button
                        type="button"
                        aria-label={`${isRevealed ? "Hide" : "Reveal"} detection ${n}`}
                        aria-pressed={!!isRevealed}
                        onClick={() => setRevealed((previous) => ({ ...previous, [id]: !previous[id] }))}
                        className="flex w-full items-center justify-center gap-2 rounded-md bg-[#171717] px-3 py-2.5 text-xs text-white"
                      >
                        {isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                        {isRevealed ? "Hide detection" : "Reveal detection"}
                      </button>
                      {isRevealed && !choice && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {(["correct", "incorrect"] as const).map((value) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setFeedback((previous) => ({ ...previous, [id]: value }))}
                              className="flex items-center justify-center gap-1 rounded-md border border-[#deded9] py-2 text-xs hover:bg-[#f6f6f4]"
                            >
                              {value === "correct" ? <Check size={14} /> : <X size={14} />}
                              {value === "correct" ? "Correct" : "Incorrect"}
                            </button>
                          ))}
                        </div>
                      )}
                      {choice && (
                        <p role="status" className="mt-2 rounded-md bg-[#efefec] py-2 text-center text-[11px]">
                          Marked {choice} (not saved yet)
                        </p>
                      )}
                      {!isRevealed && !choice && (
                        <p className="mt-2 text-center text-[10px] text-[#aaa]">Reveal this area to verify the prediction.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-xs font-medium">Was this prediction correct?</h3>
              <p className="mt-1 text-[11px] text-[#8a8a84]">Review the result and provide feedback.</p>
              {overallFeedback ? (
                <p role="status" className="mt-4 rounded-lg bg-[#efefec] p-3 text-center text-xs">
                  Marked {overallFeedback} (not saved yet)
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {(["correct", "incorrect"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setOverallFeedback(value)}
                      className="flex items-center justify-center gap-2 rounded-lg border border-[#deded9] py-3 text-xs hover:bg-[#f6f6f4]"
                    >
                      {value === "correct" ? <Check size={15} /> : <X size={15} />}
                      {value === "correct" ? "Correct" : "Incorrect"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-5">
        <Link href="/upload" className="flex items-center gap-2 rounded-lg bg-[#171717] px-4 py-3 text-xs text-white">
          <RotateCcw size={15} />
          Analyze another image
        </Link>
        <Link href="/camera" className="text-xs hover:underline">Scan another frame</Link>
        <Link href="/" className="text-xs hover:underline">Return home</Link>
      </div>

      <p className="mt-5 text-[11px] text-[#8a8a84]">
        The image and its detections are saved. Verification feedback isn&apos;t saved yet: it needs a signed-in trusted person.
      </p>
    </main>
  );
}
