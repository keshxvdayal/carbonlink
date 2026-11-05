"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Plus, ShieldCheck, Sparkles, WifiOff } from "lucide-react";
import { cx } from "@/components/ui";

const NAV = [
  { href: "/", label: "Shipments", Icon: LayoutDashboard, match: (p: string) => p === "/" || p.startsWith("/checks") },
  { href: "/new", label: "New check", Icon: Plus, match: (p: string) => p === "/new" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-teal-400 to-teal-700 shadow-inner shadow-white/20">
        <ShieldCheck className="h-[18px] w-[18px] text-white" strokeWidth={2.25} aria-hidden />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-white">TradeCheck</span>
    </Link>
  );
}

function ModeCard() {
  const [status, setStatus] = useState<{ ai: boolean; model: string | null } | null>(null);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);
  if (!status) return <div className="h-[74px] rounded-xl bg-white/5" />;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center gap-2 text-[13px] font-medium text-white">
        {status.ai ? <Sparkles className="h-4 w-4 text-teal-300" aria-hidden /> : <WifiOff className="h-4 w-4 text-slate-400" aria-hidden />}
        {status.ai ? "AI extraction on" : "Offline mode"}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        {status.ai ? `Reads scans & photos with ${status.model}.` : "Text & text-PDFs only. Add ANTHROPIC_API_KEY to read scans."}
      </p>
    </div>
  );
}

function NavLinks({ horizontal = false }: { horizontal?: boolean }) {
  const path = usePathname();
  return (
    <nav className={cx(horizontal ? "flex gap-1" : "space-y-1")}>
      {NAV.map(({ href, label, Icon, match }) => {
        const active = match(path);
        return (
          <Link
            key={href}
            href={href}
            className={cx(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition",
              active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className={horizontal ? "sr-only sm:not-sr-only" : undefined}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-[#0b1220] px-4 py-5 lg:flex">
        <div className="px-1"><Logo /></div>
        <div className="mt-8 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Workspace</div>
        <div className="mt-2"><NavLinks /></div>
        <div className="mt-auto space-y-3">
          <ModeCard />
          <p className="px-1 text-[10px] leading-relaxed text-slate-500">Flags likely discrepancies for human review. Not a substitute for your CHA, bank or customs advice.</p>
        </div>
      </aside>
      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between bg-[#0b1220] px-4 lg:hidden">
        <Logo />
        <NavLinks horizontal />
      </header>
    </>
  );
}
