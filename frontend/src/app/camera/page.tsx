"use client";
import Link from "next/link";
import { Camera, Info, RotateCcw, ScanLine } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeading from "@/components/page-heading";
import { detectionService, liveVideoUrl, percent, titleCase } from "@/lib/detection-service";
import type { ApiError, Capture, LiveCamera } from "@/types/detection";

const POLL_MS = 1000;

export default function CameraPage() {
  const router = useRouter();
  const [cameras, setCameras] = useState<LiveCamera[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [videoKey, setVideoKey] = useState(0);

  const refresh = useCallback(async () => {
    const response = await detectionService.liveCameras();
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setError(null);
    setCameras(response.data);
    setSelected((current) => current && response.data.some((c) => c.id === current) ? current : response.data[0]?.id ?? null);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const tick = async () => {
      await refresh();
      if (active) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refresh]);

  const camera = cameras?.find((c) => c.id === selected) ?? null;
  const lastSaved = camera?.lastSavedAt;

  useEffect(() => {
    if (!selected) return;
    let current = true;
    detectionService.captures(selected).then((response) => {
      if (current && response.ok) setCaptures(response.data);
    });
    return () => {
      current = false;
    };
  }, [selected, lastSaved]);

  async function scan() {
    if (!camera || scanning) return;
    setScanning(true);
    setScanError("");
    const response = await detectionService.scanCamera({ cameraId: camera.id });
    if (!response.ok) {
      setScanError(response.error.message);
      setScanning(false);
      return;
    }
    router.push(`/results?image=${response.data.id}`);
  }

  const state = error ? "error" : cameras === null ? "checking" : !camera ? "none" : camera.connected ? "live" : "reconnecting";
  const statusText = { error: "Server unreachable", checking: "Checking…", none: "No camera configured", live: "Live · Analyzing every frame", reconnecting: "Reconnecting…" }[state];

  return (
    <main className="mx-auto max-w-[1222px] px-6 pb-[72px] pt-[70px] md:px-[86px]">
      <PageHeading label="Camera scan" title="Live camera" description="Every frame from the camera is analyzed by the detection model. Scan now saves the current frame and its detections." />
      <section className="mt-9 grid overflow-hidden rounded-[14px] border border-[#deded9] bg-white lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="relative flex min-h-[360px] flex-col items-center justify-center gap-4 bg-[#f6f6f4] p-6 text-center lg:min-h-[520px]">
          {camera ? (
            <>
              {/* MJPEG streams need a plain <img>; next/image can't render them */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`${camera.id}-${videoKey}`}
                src={liveVideoUrl(camera.id)}
                alt={`Live view of ${camera.name} with detections outlined`}
                onError={() => setTimeout(() => setVideoKey((k) => k + 1), 3000)}
                className="absolute inset-0 h-full w-full bg-black object-contain"
              />
              <span className="absolute left-4 top-4 flex items-center gap-2 rounded bg-[#171717] px-3 py-2 font-mono text-[9px] uppercase tracking-wide text-white">
                <span className={`h-2 w-2 rounded-full ${camera.connected ? "bg-red-500" : "bg-[#969691]"}`} />
                {camera.connected ? "Live" : "Reconnecting"} · {camera.name}
              </span>
              {!camera.connected && camera.error && (
                <p role="status" className="z-10 max-w-xs rounded bg-white p-4 text-xs">{camera.error}</p>
              )}
            </>
          ) : (
            <>
              <span className="rounded-full border border-[#deded9] bg-white p-4"><Camera size={22} /></span>
              <h2 className="text-base font-medium">{state === "error" ? "Can't reach Detectra" : state === "checking" ? "Checking for cameras…" : "No camera configured"}</h2>
              <p role={state === "error" ? "alert" : "status"} className="max-w-xs text-xs leading-5 text-[#747470]">
                {state === "error"
                  ? error?.message
                  : state === "checking"
                    ? "Looking for live camera streams."
                    : "Set CAMERA_RTSP_URL in the backend's .env file and restart it to stream a camera."}
              </p>
              <button disabled={state === "checking"} onClick={refresh} className="flex items-center gap-2 rounded-lg border border-[#deded9] bg-white px-4 py-3 text-xs disabled:opacity-40">
                <RotateCcw size={15} />Retry connection
              </button>
            </>
          )}
        </div>

        <div className="flex flex-col p-[26px]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#747470]">Camera status</p>
          <p className="mt-6 flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${state === "live" ? "bg-green-600" : "bg-[#969691]"}`} />
            {statusText}
          </p>
          {cameras && cameras.length > 1 && (
            <select aria-label="Camera" value={selected ?? ""} onChange={(e) => setSelected(e.target.value)} className="mt-4 rounded-md border border-[#deded9] bg-white px-3 py-2 text-xs">
              {cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <dl className="my-7 space-y-4 border-y border-[#e9e9e5] py-6 text-xs">
            <div className="flex justify-between gap-2"><dt className="text-[#747470]">Camera</dt><dd>{camera?.name ?? "None"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[#747470]">Resolution</dt><dd>{camera?.width ? `${camera.width} × ${camera.height}` : "Unavailable"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[#747470]">Analysis rate</dt><dd>{camera?.fps != null ? `${camera.fps} fps` : "Unavailable"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[#747470]">Model</dt><dd className="truncate">{camera?.modelVersion ?? "Unavailable"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[#747470]">Auto-save</dt><dd>{camera ? (camera.saveInterval > 0 ? `Every ${camera.saveInterval}s, ≥ ${percent(camera.saveConfidence)}` : "Off") : "Unavailable"}</dd></div>
          </dl>

          <h3 className="text-xs font-medium">In view now</h3>
          {camera && camera.detections.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs" aria-label="Current detections">
              {camera.detections.map((d, i) => (
                <li key={i} className="flex justify-between"><span>{titleCase(d.label)}</span><span>{percent(d.confidence)}</span></li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-[#747470]">{camera?.connected ? "Nothing detected" : "Waiting for the camera"}</p>
          )}

          <button disabled={!camera?.connected || scanning} onClick={scan} className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-[#171717] px-4 py-3 text-xs text-white disabled:opacity-40">
            <ScanLine size={16} />{scanning ? "Saving frame…" : "Scan now"}
          </button>
          {scanError && <p role="alert" className="mt-2 text-xs text-red-700">{scanError}</p>}

          {captures.length > 0 && (
            <div className="mt-7">
              <h3 className="text-xs font-medium">Recent captures</h3>
              <ul className="mt-2 space-y-1 text-xs">
                {captures.map((c) => (
                  <li key={c.id}>
                    <Link href={`/results?image=${c.id}`} className="flex justify-between gap-2 hover:underline">
                      <span>{new Date(c.capturedAt).toLocaleTimeString()}</span>
                      <span className="text-[#747470]">{c.detections} {c.detections === 1 ? "detection" : "detections"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-10 flex items-start gap-2 text-[11px] leading-5 text-[#747470]"><Info size={16} className="mt-1 shrink-0" />Frames are analyzed continuously. Frames with a confident detection are saved automatically, at most once per auto-save interval; Scan now saves the current frame.</p>
        </div>
      </section>
      <Link href="/" className="mt-6 inline-block text-xs underline">Return home</Link>
    </main>
  );
}
