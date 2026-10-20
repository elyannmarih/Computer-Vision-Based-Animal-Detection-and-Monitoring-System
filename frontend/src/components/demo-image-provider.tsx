
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

type DemoImageContextValue = {
  imageUrl: string | null;
  fileName: string | null;
  setImage: (file: File) => void;
  setCameraDemo: () => void;
};

const DemoImageContext =
  createContext<DemoImageContextValue | null>(null);

export function DemoImageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const urlRef = useRef<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
      }
    };
  }, []);

  function setImage(file: File) {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
    }

    const url = URL.createObjectURL(file);
    urlRef.current = url;
    setImageUrl(url);
    setFileName(file.name);
  }

  return (
    <DemoImageContext.Provider
      value={{ imageUrl, fileName, setImage, setCameraDemo: () => {
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
        setImageUrl("/demo/camera-frame.png");
        setFileName("Simulated camera frame");
      } }}
    >
      {children}
    </DemoImageContext.Provider>
  );
}

export function useDemoImage() {
  const context = useContext(DemoImageContext);

  if (!context) {
    throw new Error("DemoImageProvider is missing");
  }

  return context;
}
