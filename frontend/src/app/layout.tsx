
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AppShell from "@/components/app-shell";
import "./globals.css";
import { DemoImageProvider } from "@/components/demo-image-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Detectra",
  description: "Computer Vision-Based Animal Detection System",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${inter.variable} antialiased`}>
      <DemoImageProvider>
        <AppShell>{children}</AppShell>
      </DemoImageProvider>
    </body>
    </html>
  );
}
