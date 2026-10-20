import Link from "next/link";
import PageHeading from "@/components/page-heading";
const steps = [
  ["Choose a Detection Method", "Start with Image analysis to upload a photo, or Camera scan for a single frame from a connected IP camera. Real detection and camera connections await backend integration."],
  ["Submit or Capture an Image", "Drag a JPG, PNG, or WEBP image into the upload area, or browse your device. The limit is 10 MB. You can preview, replace, or remove it. Future camera scans will capture one frame only when requested."],
  ["Review Detection Results", "The demo lets you explore possible lizards and their confidence scores, or a No Lizard Detected result. Every score and box is simulated; no AI model has analyzed your image."],
  ["Reveal Hidden Detections", "Detection areas start hidden. Select Reveal detection for an individual area when you are ready. Hide detection covers that area again without changing the others."],
  ["Verify Predictions", "After revealing an area, choose Correct or Incorrect for that detection. You can also give feedback on the no-detection scenario. Confirmation is local to the demo. Future backend integration will store verification to improve detection data quality."],
  ["Analyze Again", "Choose Analyze another image, scan another frame, or Return home to choose a new source. Refreshing or leaving the browser clears your demo image and feedback."],
];
export default function HowToUsePage() {
  return <main className="mx-auto max-w-[1222px] px-6 pb-[72px] pt-[70px] md:px-[86px]">
    <PageHeading label="How to use" title="A simple guide to Detectra" description="From choosing an image to reviewing each possible detection, at your own pace." />
    <p className="mt-9 rounded-lg border border-dashed border-[#c8c8c1] p-4 text-xs leading-5 text-[#747470]">Available now: local image upload, demo results, individual reveal controls, and temporary feedback. AI analysis, live camera access, and permanent storage are awaiting integration.</p>
    <ol className="mt-5 divide-y divide-[#e9e9e5] rounded-[14px] border border-[#deded9] bg-white px-6">
      {steps.map(([title, description], i) => <li key={title} className="grid gap-3 py-7 sm:grid-cols-[75px_1fr]">
        <span className="font-mono text-[11px] text-[#747470]">STEP {String(i+1).padStart(2,"0")}</span>
        <div><h2 className="text-lg font-medium tracking-tight">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#747470]">{description}</p></div>
      </li>)}
    </ol>
    <div className="mt-6 flex flex-wrap gap-5 text-xs"><Link href="/upload" className="rounded-lg bg-[#171717] px-4 py-3 text-white">Upload an image</Link><Link href="/camera" className="py-3 underline">Try camera scan</Link><Link href="/" className="py-3 underline">Return home</Link></div>
  </main>;
}
