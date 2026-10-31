import Link from "next/link";
import PageHeading from "@/components/page-heading";
const steps = [
  ["Choose a Detection Method", "Start with Image analysis to upload a photo, or Camera scan to watch a connected IP camera, where the model analyzes every frame."],
  ["Submit or Capture an Image", "Drag a JPG, PNG, or WEBP image into the upload area, or browse your device. The limit is 10 MB. You can preview, replace, or remove it before analyzing. On the camera page, Scan now saves the current frame; frames with detections are also saved automatically."],
  ["Review Detection Results", "Results show what the model found, with a confidence score for each detection, or Nothing detected. The image and its detections are saved, so the results page can be reopened later."],
  ["Reveal Hidden Detections", "Detection areas start hidden. Select Reveal detection for an individual area when you are ready. Hide detection covers that area again without changing the others."],
  ["Verify Predictions", "After revealing an area, choose Correct or Incorrect for that detection. You can also give feedback when nothing was detected. For saved results, first select your existing reviewer record; confirmation appears only after the database saves the feedback. Local demo previews keep feedback in your browser."],
  ["Analyze Again", "Choose Analyze another image, scan another frame, or Return home to choose a new source."],
];
export default function HowToUsePage() {
  return <main className="mx-auto max-w-[1222px] px-6 pb-[72px] pt-[70px] md:px-[86px]">
    <PageHeading label="How to use" title="A simple guide to Detectra" description="From choosing an image to reviewing each possible detection, at your own pace." />
    <p className="mt-9 rounded-lg border border-dashed border-[#c8c8c1] p-4 text-xs leading-5 text-[#747470]">Available now: image upload and live camera analysis with the detection model you pick in the sidebar (lizards, dogs, deer and more), saved results, individual reveal controls, saved reviewer feedback, and a local demo preview that never uploads your image.</p>
    <ol className="mt-5 divide-y divide-[#e9e9e5] rounded-[14px] border border-[#deded9] bg-white px-6">
      {steps.map(([title, description], i) => <li key={title} className="grid gap-3 py-7 sm:grid-cols-[75px_1fr]">
        <span className="font-mono text-[11px] text-[#747470]">STEP {String(i+1).padStart(2,"0")}</span>
        <div><h2 className="text-lg font-medium tracking-tight">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#747470]">{description}</p></div>
      </li>)}
    </ol>
    <div className="mt-6 flex flex-wrap gap-5 text-xs"><Link href="/upload" className="rounded-lg bg-[#171717] px-4 py-3 text-white">Upload an image</Link><Link href="/camera" className="py-3 underline">Try camera scan</Link><Link href="/" className="py-3 underline">Return home</Link></div>
  </main>;
}
