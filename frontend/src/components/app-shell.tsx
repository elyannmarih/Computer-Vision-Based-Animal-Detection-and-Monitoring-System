
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  Camera,
  BookOpen,
  House,
  Image as ImageIcon,
  ScanLine,
} from "lucide-react";

const links = [
  { href: "/", label: "Home", icon: House },
  { href: "/upload", label: "Image analysis", icon: ImageIcon },
  { href: "/camera", label: "Camera scan", icon: Camera },
  { href: "/how-to-use", label: "How to use", icon: BookOpen },
];

export default function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  const pageTitle =
  pathname === "/upload"
    ? "Image analysis"
    : pathname === "/camera"
      ? "Camera scan"
      : pathname === "/results"
        ? "Detection results"
        : pathname === "/how-to-use" ? "How to use" : "Overview";

  return (
    <div className="min-h-screen bg-[#f6f6f4] text-[#171717]">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-[248px] flex-col border-r border-[#deded9] bg-white px-[18px] pb-[22px] pt-[28px] md:flex">
        <Link href="/" className="flex items-center gap-[10px] px-[10px]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#171717] text-white">
            <ScanLine size={18} />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Detectra
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="mt-[58px] space-y-1">
          <p className="px-3 pb-[10px] font-mono text-[10px] uppercase tracking-[1px] text-[#8a8a84]">
            Workspace
          </p>

          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-[11px] rounded-lg px-3 py-[11px] text-[13px] ${
                  active
                    ? "bg-[#efefec] font-medium"
                    : "text-[#6c6c68] hover:bg-[#f6f6f4]"
                }`}
              >
                <Icon size={18} strokeWidth={1.7} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-[#e9e9e5] px-[10px] pt-[18px]">
          <div className="flex items-start gap-[9px]">
            <span className="mt-[6px] h-[7px] w-[7px] rounded-full bg-[#969691]" />
            <div>
              <p className="text-[11px] font-medium">Detection model</p>
              <p className="mt-1 text-[11px] text-[#969691]">
                Integration pending
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen md:ml-[248px]">
        <header className="flex h-[72px] items-center justify-between border-b border-[#deded9] px-6 md:px-10">
          <div className="flex items-center gap-5">
            <Link href="/" className="font-semibold md:hidden">
              Detectra
            </Link>
            <span className="hidden text-xs font-medium sm:inline">{pageTitle}</span>
          </div>
          <span className="flex items-center gap-[9px] text-[11px] text-[#747470]">
            <span className="h-[6px] w-[6px] rounded-full bg-[#747470]" />
            Frontend preview
          </span>
        </header>

        <nav aria-label="Mobile navigation" className="flex flex-wrap gap-4 border-b border-[#deded9] px-6 py-3 text-xs md:hidden">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className="hover:underline">
              {label}
            </Link>
          ))}
        </nav>

        <div id="main-content" tabIndex={-1}>{children}</div>
      </div>
    </div>
  );
}
