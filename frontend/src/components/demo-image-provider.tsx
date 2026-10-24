"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DetectionResult, ImageSource } from "@/types/detection";

type ImageSession = { kind: "empty" } | { kind: "local-demo"; image: ImageSource } | { kind: "backend"; result: DetectionResult };
type ImageContextValue = {
  result: DetectionResult | null;
  imageUrl: string | null;
  fileName: string | null;
  setResult: (result: DetectionResult) => void;
  setImage: (file: File) => void;
  setCameraDemo: () => void;
};
const ImageContext = createContext<ImageContextValue | null>(null);

/** Shared image session for local demos and backend results. Retains the existing public API. */
export function DemoImageProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ImageSession>({ kind: "empty" });
  const objectUrl = useRef<string | null>(null);
  function releasePreview() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  }
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  const result = session.kind === "backend" ? session.result : null;
  const image = session.kind === "backend" ? session.result.image : session.kind === "local-demo" ? session.image : null;
  return <ImageContext.Provider value={{
    result, imageUrl: image?.url ?? null, fileName: image?.name ?? null,
    setResult(value) { releasePreview(); setSession({ kind: "backend", result: value }); },
    setImage(file) {
      releasePreview();
      objectUrl.current = URL.createObjectURL(file);
      setSession({ kind: "local-demo", image: { url: objectUrl.current, name: file.name, origin: "upload" } });
    },
    setCameraDemo() {
      releasePreview();
      setSession({ kind: "local-demo", image: { url: "/demo/camera-frame.png", name: "Simulated camera frame", origin: "camera-demo" } });
    },
  }}>{children}</ImageContext.Provider>;
}
export function useDemoImage() {
  const value = useContext(ImageContext);
  if (!value) throw new Error("DemoImageProvider is missing");
  return value;
}
