
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  Eye,
  EyeOff,
  ImageOff,
  RotateCcw,
  X,
} from "lucide-react";
import { demoResult, percent } from "@/lib/demo-data";
import { detectionService, titleCase } from "@/lib/detection-service";
import ReviewerPanel from "@/components/reviewer-panel";
import type { DetectionResult, Verification as Feedback, Scenario } from "@/types/detection";
import { useDemoImage } from "@/components/demo-image-provider";

export default function ResultsView() {
  const session = useDemoImage();
  // /results?image=<id> opens a saved result (camera captures, refreshes, shared links). The upload flow's
  // in-memory result is used directly when it is the same image, so it shows without a second request.
  const imageId = useSearchParams().get("image");
  const [loaded, setLoaded] = useState<{ id: string; result?: DetectionResult; error?: string } | null>(null);
  const cached = imageId && session.result?.id === imageId ? session.result : null;
  useEffect(() => {
    if (!imageId || cached) return;
    let current = true;
    detectionService.result(imageId).then((response) => {
      if (current) setLoaded(response.ok ? { id: imageId, result: response.data } : { id: imageId, error: response.error.message });
    });
    return () => { current = false; };
  }, [imageId, cached]);
  const backendResult = imageId ? cached ?? (loaded?.id === imageId ? loaded.result ?? null : null) : session.result;
  const imageUrl = imageId ? backendResult?.image.url ?? null : session.imageUrl;
  const fileName = imageId ? backendResult?.image.name ?? null : session.fileName;

  const [imageRatio, setImageRatio] = useState(4 / 3);
  const [scenario, setScenario] = useState<Scenario>("detected");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [overallFeedback, setOverallFeedback] =
    useState<Feedback | null>(null);

  const connected = backendResult?.mode === "backend";
  const result = backendResult ?? demoResult({ url: imageUrl ?? "", name: fileName ?? "image", origin: imageUrl?.startsWith("/demo/") ? "camera-demo" : "upload" }, scenario);
  const detections = result.detections;
  const highest = Math.max(0, ...detections.map(d => d.confidence));
  const hasDetections = detections.length > 0;
  const [reviewerId, setReviewerId] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [saving, setSaving] = useState(false);

  function changeScenario(value: Scenario) {
    setScenario(value);
    setRevealed({});
    setFeedback({});
    setOverallFeedback(null);
  }

  function toggleReveal(id: string) {
    setRevealed((previous) => ({
      ...previous,
      [id]: !previous[id],
    }));
  }

  async function markDetection(id: string | undefined, value: Feedback) {
    if (saving) return;
    setFeedbackError("");
    if (connected) {
      if (!reviewerId) { setFeedbackError("Select an existing reviewer before saving feedback."); return; }
      setSaving(true);
      const response = await detectionService.verify({ resultId: result.id, detectionId: id, verdict: value, reviewerId });
      setSaving(false);
      if (!response.ok) { setFeedbackError(response.error.message); return; }
    }
    if (id) setFeedback(previous => ({ ...previous, [id]: value }));
    else setOverallFeedback(value);
  }

  if (imageId && !backendResult) {
    const error = loaded?.id === imageId ? loaded.error : undefined;
    return (
      <main className="mx-auto max-w-[1050px] px-6 py-20">
        {error ? <>
          <h1 className="text-4xl tracking-tight">Couldn&apos;t load this result</h1>
          <p role="alert" className="mt-4 text-sm text-[#747470]">{error}</p>
          <Link href="/upload" className="mt-8 inline-block rounded-lg bg-[#171717] px-5 py-3 text-xs text-white">Go to image analysis</Link>
        </> : <p role="status" className="text-sm text-[#747470]">Loading results…</p>}
      </main>
    );
  }

  if (!imageUrl) {
    return (
      <main className="mx-auto max-w-[1050px] px-6 py-20">
        <h1 className="text-4xl tracking-tight">
          No image selected
        </h1>
        <p className="mt-4 text-sm text-[#747470]">
          Upload an image to preview the detection results interface.
        </p>
        <Link
          href="/upload"
          className="mt-8 inline-block rounded-lg bg-[#171717] px-5 py-3 text-xs text-white"
        >
          Go to image analysis
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1222px] px-6 pb-16 pt-[70px] md:px-[86px]">
      <div className="mb-9 grid gap-4 md:grid-cols-[210px_1fr]">
        <p className="pt-3 font-mono text-[10px] uppercase tracking-[1px] text-[#8a8a84]">
          Detection results
        </p>

        <div>
          <h1 className="text-[clamp(36px,4vw,56px)] leading-none tracking-[-0.055em]">
            {connected ? (result.simulated ? "Backend results · Simulated model" : "Detection results") : "Demo results preview"}
          </h1>
          <p className="mt-4 text-[13px] text-[#747470]">
            {connected ? `${result.image.origin === "camera" ? "Camera frame" : "Uploaded image"}${result.capturedAt ? ` · ${new Date(result.capturedAt).toLocaleString()}` : ""} · ${detections.length} ${detections.length === 1 ? "detection" : "detections"}${result.modelVersion ? ` from ${result.modelVersion}` : ""}.` : hasDetections ? "Demo scenario: two possible lizard detections." : "Demo scenario: no lizard detected."}
          </p>
        </div>
      </div>

      {/* Clearly identify simulated results */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-[#c8c8c1] px-4 py-3">
        <p className="text-xs text-[#747470]">
{connected ? (result.simulated ? `Simulated predictions from ${result.modelVersion}. FastAPI stored this image, but no trained YOLO model analyzed it.` : `Backend model: ${result.modelVersion ?? "not recorded (nothing was detected)"}.`) : "Demo preview only. No AI model has analyzed this image."}
        </p>

        {!connected && <select
          aria-label="Demo scenario"
          value={scenario}
          onChange={(event) =>
            changeScenario(event.target.value as Scenario)
          }
          className="rounded-md border border-[#deded9] bg-white px-3 py-2 text-xs"
        >
          <option value="detected">Two detections</option>
          <option value="none">No detection</option>
        </select>}
      </div>

      {connected && <ReviewerPanel reviewerId={reviewerId} onChange={setReviewerId} saving={saving} />}
      {feedbackError && <p role="alert" className="mb-4 rounded border border-[#deded9] p-4 text-sm">{feedbackError}</p>}
      {saving && <p role="status" className="mb-4 text-xs">Saving feedback to backend…</p>}
      <section className="grid overflow-hidden rounded-[14px] border border-[#deded9] bg-white lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Analyzed image */}
        <div className="flex items-center bg-[#efefec] p-4"><div className="relative w-full overflow-hidden" style={{ aspectRatio: imageRatio }}>
          <Image
            src={imageUrl}
            alt={`Selected image: ${fileName ?? "image"}`}
            fill
            unoptimized
            onLoad={(event) => setImageRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
            className="object-fill"
          />

          <span className="absolute left-4 top-4 rounded bg-[#171717] px-3 py-2 font-mono text-[9px] uppercase tracking-wide text-white">
            {detections.length} {result.simulated ? "simulated" : "model"} detections
          </span>

          {/* Illustrative boxes, not model coordinates */}
          {hasDetections &&
            detections.map((detection, index) => {
              const isRevealed = revealed[detection.id];

              return (
                <div
                  key={detection.id}
                  className={`absolute flex items-center justify-center overflow-hidden border ${
                    isRevealed
                      ? "border-2 border-white bg-transparent"
                      : "border-white bg-[#171717]"
                  }`}
                  aria-label={`Simulated detection ${index + 1}: ${isRevealed ? "revealed" : "hidden"}`}
                  data-testid={`detection-box-${detection.id}`}
                  data-revealed={!!isRevealed}
                  style={{ left: `${detection.box.x * 100}%`, top: `${detection.box.y * 100}%`, width: `${detection.box.width * 100}%`, height: `${detection.box.height * 100}%` }}
                >
                  {isRevealed ? (
                    <span className="absolute left-0 top-0 bg-white px-2 py-1 font-mono text-[9px] text-[#171717]">
                      #{index + 1}<span className="hidden sm:inline"> · {titleCase(detection.label)} · {percent(detection.confidence)}</span>
                    </span>
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-2 text-center text-white">
                      <ImageOff size={19} />
                      <p className="hidden text-[10px] sm:block">
                        Sensitive area hidden
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        </div>
        {/* Result panel */}
        <div className="flex flex-col p-[26px]">
          <p className="font-mono text-[10px] uppercase tracking-[1px] text-[#8a8a84]">
            Result / 01
          </p>

          <div className="mt-7 flex h-10 w-10 items-center justify-center rounded-full border border-[#171717]">
            <Check size={20} strokeWidth={1.5} />
          </div>

          <h2 className="mt-5 text-[38px] leading-[0.95] tracking-[-0.05em]">
            {hasDetections ? (
              <>
                {[...new Set(detections.map((d) => titleCase(d.label)))].join(", ")}
                <br />
                detected
              </>
            ) : (
              <>
                {connected ? "Nothing" : "No lizard"}
                <br />
                detected
              </>
            )}
          </h2>

          <p className="mt-5 text-xs leading-5 text-[#747470]">
            {connected ? (result.simulated ? "Review each backend result independently. Stub predictions do not establish whether an animal is present." : "Review each highlighted area independently.") : hasDetections ? "This demo illustrates two possible detections. Review each highlighted area separately." : "This demo illustrates a negative detection result. You can verify the prediction below."}
          </p>

          <div className="my-7 border-y border-[#e9e9e5] py-5">
            <div className="flex items-end justify-between gap-2">
              <p className="text-[11px] text-[#8a8a84]">
                {hasDetections
                  ? "Highest confidence"
                  : "No candidates"}
              </p>
              <span className="text-[23px] tracking-tight">
                {hasDetections ? percent(highest) : "N/A"}
              </span>
            </div>

            <div className="mt-3 h-[3px] bg-[#e9e9e5]">
              <div
                className="h-full bg-[#171717]"
                style={{
                  width: hasDetections ? percent(highest) : "0%",
                }}
              />
            </div>

            <p className="mt-2 text-right font-mono text-[9px] uppercase text-[#aaa]">
              {hasDetections
                ? (result.simulated ? "Simulated confidence" : "Model confidence")
                : connected ? "No detections" : "Demo: no detections"}
            </p>
          </div>

          {hasDetections ? (
            <div>
              <h3 className="text-xs font-medium">
                Verify each detection
              </h3>
              <p className="mt-1 text-[11px] text-[#8a8a84]">
                Review every highlighted area independently.
              </p>

              <div className="mt-4 space-y-3">
                {detections.map((detection, index) => {
                  const isRevealed = revealed[detection.id];
                  const choice = feedback[detection.id];

                  return (
                    <div
                      key={detection.id}
                      role="group" aria-label={`Detection ${index + 1}`}
                      className="rounded-lg border border-[#e9e9e5] p-3"
                    >
                      <div className="mb-3 flex justify-between text-[11px]">
                        <span className="text-[#747470]">
                          Detection #{index + 1} · {titleCase(detection.label)}
                        </span>
                        <span>{percent(detection.confidence)}</span>
                      </div>

                      <button
                        type="button"
                        aria-label={`${isRevealed ? "Hide" : "Reveal"} detection ${index + 1}`}
                        aria-pressed={!!isRevealed}
                        onClick={() => toggleReveal(detection.id)}
                        className="flex w-full items-center justify-center gap-2 rounded-md bg-[#171717] px-3 py-2.5 text-xs text-white"
                      >
                        {isRevealed ? (
                          <EyeOff size={15} />
                        ) : (
                          <Eye size={15} />
                        )}
                        {isRevealed
                          ? "Hide detection"
                          : "Reveal detection"}
                      </button>

                      {isRevealed && !choice && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={saving || (connected && !reviewerId)}
                            onClick={() =>
                              markDetection(detection.id, "correct")
                            }
                            className="flex items-center justify-center gap-1 rounded-md border border-[#deded9] py-2 text-xs hover:bg-[#f6f6f4]"
                          >
                            <Check size={14} />
                            Correct
                          </button>
                          <button
                            type="button"
                            disabled={saving || (connected && !reviewerId)}
                            onClick={() =>
                              markDetection(detection.id, "incorrect")
                            }
                            className="flex items-center justify-center gap-1 rounded-md border border-[#deded9] py-2 text-xs hover:bg-[#f6f6f4]"
                          >
                            <X size={14} />
                            Incorrect
                          </button>
                        </div>
                      )}

                      {choice && (
                        <p
                          role="status"
                          className="mt-2 rounded-md bg-[#efefec] py-2 text-center text-[11px]"
                        >
                          Marked {choice} {connected ? "(saved to backend)" : "(demo only)"}
                        </p>
                      )}

                      {!isRevealed && !choice && (
                        <p className="mt-2 text-center text-[10px] text-[#aaa]">
                          Reveal this area to verify the prediction.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-xs font-medium">
                Was this prediction correct?
              </h3>
              <p className="mt-1 text-[11px] text-[#8a8a84]">
                Review the result and provide feedback.
              </p>

              {overallFeedback ? (
                <p role="status" className="mt-4 rounded-lg bg-[#efefec] p-3 text-center text-xs">
                  Marked {overallFeedback} {connected ? "(saved to backend)" : "(demo only)"}
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {(["correct", "incorrect"] as const).map(
                    (value) => (
                      <button
                        key={value}
                        type="button"
                        disabled={saving || (connected && !reviewerId)}
                        onClick={() => markDetection(undefined, value)}
                        className="flex items-center justify-center gap-2 rounded-lg border border-[#deded9] py-3 text-xs hover:bg-[#f6f6f4]"
                      >
                        {value === "correct" ? (
                          <Check size={15} />
                        ) : (
                          <X size={15} />
                        )}
                        {value === "correct"
                          ? "Correct"
                          : "Incorrect"}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-5">
        <Link
          href="/upload"
          className="flex items-center gap-2 rounded-lg bg-[#171717] px-4 py-3 text-xs text-white"
        >
          <RotateCcw size={15} />
          Analyze another image
        </Link>

        <Link href="/camera" className="text-xs hover:underline">Scan another frame</Link>
        <Link href="/" className="text-xs hover:underline">
          Return home
        </Link>
      </div>

      <p className="mt-5 text-[11px] text-[#8a8a84]">
        {connected ? `Image and detection records were stored by FastAPI. ${result.simulated ? "Confidence scores and boxes are simulated, not trained-model predictions." : "Results come from the backend model."} Feedback is saved only when confirmed. This result stays available at this page's link.` : "All confidence scores, detection locations, and feedback on this screen are simulated. Nothing has been saved to a database."}
      </p>
    </main>
  );
}
