
import Link from "next/link";
import { ArrowRight, Camera, Info, Upload } from "lucide-react";

const options = [
  {
    number: "01",
    title: "Upload image",
    description:
      "Select a JPG, PNG, or WEBP file from your device and analyze it with the selected detection model.",
    href: "/upload",
    icon: Upload,
    dark: false,
  },
  {
    number: "02",
    title: "Scan camera",
    description:
      "Watch the connected IP camera with detections on every frame, and save a frame on demand.",
    href: "/camera",
    icon: Camera,
    dark: true,
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-[1222px] px-6 pb-[72px] pt-[54px] md:px-[86px]">
      <p className="font-mono text-[10px] uppercase tracking-[1px] text-[#8a8a84]">
        AI-powered visual detection
      </p>

      <h1 className="mt-5 max-w-[800px] text-[clamp(44px,5.2vw,76px)] leading-[0.98] tracking-[-0.065em]">
        What would you like
        <span className="block">to analyze?</span>
      </h1>

      <p className="mt-[30px] max-w-[590px] text-sm leading-[22px] text-[#747470]">
        Upload a photo or watch a live camera. The selected YOLO model (lizards, dogs and more)
        finds animals, and every analyzed image is saved with its detections.
      </p>

      <div className="mt-[54px] grid gap-[14px] lg:grid-cols-2">
        {options.map(({ number, title, description, href, icon: Icon, dark }) => (
          <Link
            key={href}
            href={href}
            className={`flex min-h-[274px] flex-col justify-between rounded-xl border px-[26px] pb-[25px] pt-6 hover:opacity-90 ${
              dark
                ? "border-[#171717] bg-[#171717] text-white"
                : "border-[#deded9] bg-white text-[#171717]"
            }`}
          >
            <div className="flex items-start justify-between">
              <span className={`flex h-[42px] w-[42px] items-center justify-center rounded-[9px] border ${
                dark ? "border-[#454545] bg-[#232323]" : "border-[#deded9]"
              }`}>
                <Icon size={22} strokeWidth={1.6} />
              </span>
              <ArrowRight size={21} />
            </div>

            <div>
              <p className={`font-mono text-[10px] tracking-[1px] ${
                dark ? "text-[#aaa]" : "text-[#8a8a84]"
              }`}>
                {number}
              </p>
              <h2 className="mt-3 text-[23px] font-medium tracking-tight">
                {title}
              </h2>
              <p className={`mt-2 max-w-[360px] text-xs leading-[19px] ${
                dark ? "text-[#aaa]" : "text-[#747470]"
              }`}>
                {description}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-[22px] flex items-center gap-2 text-[11px] text-[#888883]">
        <Info size={17} />
        Analyze image saves the image and its detections to the Detectra database; local demo previews stay in your browser.
      </p>
    </main>
  );
}
