"use client";
import Image from "next/image";
import Link from "next/link";
import { Camera, Info, RotateCcw, ScanLine } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeading from "@/components/page-heading";
import { useDemoImage } from "@/components/demo-image-provider";
import { detectionService } from "@/lib/detection-service";
import { demoDelay } from "@/lib/demo-data";

type State = "unavailable" | "checking" | "demo" | "scanning" | "error";
export default function CameraPage() {
  const [state, setState] = useState<State>("unavailable");
  const { setCameraDemo } = useDemoImage();
  const router = useRouter();
  const busy = state === "checking" || state === "scanning";
  async function retry() {
    setState("checking");
    try { await demoDelay(); await detectionService.cameraStatus(); setState("unavailable"); }
    catch { setState("error"); }
  }
  async function scan() {
    if (state !== "demo") return;
    setState("scanning");
    try { await demoDelay(); setCameraDemo(); router.push("/results"); }
    catch { setState("error"); }
  }
  return <main className="mx-auto max-w-[1222px] px-6 pb-[72px] pt-[70px] md:px-[86px]">
    <PageHeading label="Camera scan" title="Scan a camera frame" description="Capture one frame and review it on demand. Camera and AI integration are pending." />
    <section className="mt-9 grid overflow-hidden rounded-[14px] border border-[#deded9] bg-white lg:grid-cols-[minmax(0,1fr)_310px]">
      <div className="relative flex min-h-[360px] flex-col items-center justify-center gap-4 bg-[#f6f6f4] p-6 text-center lg:min-h-[520px]">
        {state === "demo" || state === "scanning" ? <>
          <Image src="/demo/camera-frame.png" alt="Static demonstration frame of a residential entrance" fill className="object-cover" />
          <span className="absolute left-4 top-4 rounded bg-[#171717] p-3 text-xs text-white">Demo still image · No live camera</span>
          {state === "scanning" && <p role="status" className="z-10 rounded bg-white p-4 text-sm">Preparing simulated results…</p>}
        </> : <>
          <span className="rounded-full border border-[#deded9] bg-white p-4"><Camera size={22} /></span>
          <h2 className="text-base font-medium">{state === "error" ? "Connection error (simulated)" : state === "checking" ? "Checking availability…" : "Camera unavailable"}</h2>
          <p role={state === "error" ? "alert" : "status"} className="max-w-xs text-xs leading-5 text-[#747470]">{state === "error" ? "This is a simulated connection failure. Retry to return to the unavailable state." : "No camera service is configured. A real camera cannot be accessed yet."}</p>
          <button disabled={busy} onClick={retry} className="flex items-center gap-2 rounded-lg border border-[#deded9] bg-white px-4 py-3 text-xs disabled:opacity-40"><RotateCcw size={15} />{busy ? "Checking…" : "Retry connection"}</button>
        </>}
      </div>
      <div className="flex flex-col p-[26px]">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#747470]">Camera status</p>
        <p className="mt-6 flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full bg-[#969691]" />{state === "demo" || state === "scanning" ? "Demo mode · Not connected" : "Not connected"}</p>
        <dl className="my-7 space-y-4 border-y border-[#e9e9e5] py-6 text-xs">
          <div className="flex justify-between gap-2"><dt className="text-[#747470]">Camera</dt><dd>Integration pending</dd></div>
          <div className="flex justify-between"><dt className="text-[#747470]">Mode</dt><dd>Single frame</dd></div>
          <div className="flex justify-between"><dt className="text-[#747470]">Resolution</dt><dd>Unavailable</dd></div>
        </dl>
        <button disabled className="flex items-center justify-center gap-2 rounded-lg bg-[#171717] px-4 py-3 text-xs text-white opacity-40"><ScanLine size={16} />Scan now</button>
        <p className="mt-2 text-xs leading-5 text-[#747470]">Real scanning awaits the backend.</p>
        <button disabled={busy} onClick={() => setState(state === "demo" ? "unavailable" : "demo")} className="mt-5 rounded-lg border border-[#deded9] px-4 py-3 text-xs disabled:opacity-40">{state === "demo" ? "Exit demo" : "Try camera demo"}</button>
        {state === "demo" && <button onClick={scan} className="mt-2 rounded-lg bg-[#171717] px-4 py-3 text-xs text-white">Preview simulated scan</button>}
        <button disabled={busy} onClick={() => setState("error")} className="mt-4 text-xs text-[#747470] underline disabled:opacity-40">Simulate connection error</button>
        <p className="mt-10 flex items-start gap-2 text-[11px] leading-5 text-[#747470]"><Info size={16} className="mt-1 shrink-0" />Scanning is on demand. Detectra does not monitor continuously. Demo images and feedback are not saved.</p>
      </div>
    </section>
    <Link href="/" className="mt-6 inline-block text-xs underline">Return home</Link>
  </main>;
}
