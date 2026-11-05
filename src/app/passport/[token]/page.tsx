"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, Download, Loader2, Printer } from "lucide-react";
import { Logo } from "@/components/shell";
import { Card, Grade, btn } from "@/components/ui";
import { SECTOR_LABEL } from "@/lib/factors";
import { fmt } from "@/lib/format";
import type { Sector } from "@/lib/types";

type Passport = {
  generatedAt: string;
  installation: { operator: string; city: string; state: string; country: string };
  reportingPeriod: { from: string | null; to: string | null; months: number };
  method: string;
  products: { name: string; cnCode: string; sector: Sector | null; productionRoute: string | null; outputTonnes: number; specificEmbeddedEmissions: { direct: number; indirect: number }; usesDefaultValuesForPrecursors: boolean }[];
  dataQuality: { quality: number; completeness: number; grade: "A" | "B" | "C" | "D" };
  verification: { by: string; at: string; statement: string } | null;
  evidence: { file: string; sha256: string; type: string }[];
};

export default function PassportPage() {
  const { token } = useParams<{ token: string }>();
  const [p, setP] = useState<Passport | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    fetch(`/api/passport/${token}`).then(async (r) => (r.ok ? setP(await r.json()) : setMissing(true)));
  }, [token]);

  if (missing) return <div className="grid min-h-screen place-items-center p-6 text-center text-slate-600">This passport is not published yet.</div>;
  if (!p) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" aria-hidden /></div>;

  const download = () => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${p.installation.operator.replace(/[^a-z0-9]+/gi, "-")}-carbon-passport.json`;
    a.click();
  };

  return (
    <div className="min-h-screen">
      <header className="no-print flex items-center justify-between bg-[#0a1512] px-4 py-3 sm:px-8"><Logo /><span className="text-xs font-medium uppercase tracking-wider text-emerald-300">Carbon Passport</span></header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-emerald-800">Supplier carbon passport · CBAM</p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-tight">{p.installation.operator}</h1>
            <p className="mt-1 text-sm text-slate-500">{p.installation.city}, {p.installation.state}, India · {p.reportingPeriod.from} → {p.reportingPeriod.to} ({p.reportingPeriod.months} months)</p>
          </div>
          <div className="flex items-center gap-2"><Grade grade={p.dataQuality.grade} /><span className="text-sm text-slate-600">Data quality {p.dataQuality.quality}/100</span></div>
        </div>

        {p.verification ? (
          <Card className="flex items-start gap-3 border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /><div><div className="font-semibold">Verified by {p.verification.by}</div><div className="text-emerald-900/80">{p.verification.statement}</div></div></Card>
        ) : (
          <Card className="p-4 text-sm text-slate-600">Self-declared by the supplier, not yet third-party verified.</Card>
        )}

        <div className="grid gap-4">
          {p.products.filter((x) => x.outputTonnes > 0).map((x) => (
            <Card key={x.name} className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div><div className="text-lg font-semibold">{x.name}</div><div className="text-xs text-slate-500"><span className="font-mono">{x.cnCode}</span> · {x.sector ? SECTOR_LABEL[x.sector] : ""} · {x.productionRoute}</div></div>
                <div className="text-right"><div className="num text-2xl font-semibold">{x.specificEmbeddedEmissions.direct.toFixed(3)}</div><div className="text-xs text-slate-500">tCO₂e/t direct · {x.specificEmbeddedEmissions.indirect.toFixed(3)} indirect</div></div>
              </div>
              <div className="mt-2 text-xs text-slate-500">Based on {fmt(x.outputTonnes, 0)} t produced{x.usesDefaultValuesForPrecursors ? " · some precursors on EU default values" : ""}</div>
            </Card>
          ))}
        </div>

        <Card className="p-5 text-xs text-slate-600">
          <div className="font-semibold text-slate-800">Method</div>
          <p className="mt-1">{p.method}.</p>
          <div className="mt-3 font-semibold text-slate-800">Evidence ({p.evidence.length} documents, by SHA-256)</div>
          <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-slate-500">{p.evidence.map((e) => <li key={e.sha256} className="truncate">{e.sha256} {e.file}</li>)}</ul>
        </Card>

        <div className="no-print flex gap-2">
          <button className={btn.secondary} onClick={download}><Download className="h-4 w-4" aria-hidden /> JSON for your buyer&apos;s system</button>
          <button className={btn.secondary} onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Print / PDF</button>
        </div>
        <p className="text-xs text-slate-400">Generated {new Date(p.generatedAt).toLocaleString("en-IN")} by CarbonLink. One passport, shared with every buyer: suppliers fill in their data once.</p>
      </main>
    </div>
  );
}
