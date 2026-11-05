"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Download, FileCheck2, Gauge, IndianRupee, Loader2, MessageCircle, Sparkles, UserPlus, Users } from "lucide-react";
import { Card, CardHeader, Grade, Meter, SEV, Skeleton, StatTile, StatusPill, btn } from "@/components/ui";
import { eur, fmt, inr } from "@/lib/format";
import { whatsappInvite } from "@/lib/i18n";
import type { Lang, Settings, SupplierStatus } from "@/lib/types";
import { useOrigin } from "@/lib/use-origin";

type Row = {
  id: string;
  name: string;
  city: string;
  state: string;
  status: SupplierStatus;
  language: Lang;
  phone: string;
  portalToken: string;
  products: { name: string; cnCode: string; seePriced: number; defaultPriced: number | null; outputTonnes: number }[];
  months: number;
  evidenceCount: number;
  score: { quality: number; completeness: number; verificationReady: boolean; grade: "A" | "B" | "C" | "D" };
  counts: { critical: number; major: number; minor: number };
  savingEur: number;
};

function Counts({ c }: { c: Row["counts"] }) {
  const parts = (["critical", "major", "minor"] as const).filter((s) => c[s] > 0);
  if (!parts.length) return <span className="text-xs text-slate-500">No open flags</span>;
  return (
    <span className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-slate-600">
      {parts.map((s) => {
        const S = SEV[s];
        return (
          <span key={s} className="inline-flex items-center gap-1">
            <S.Icon className="h-3.5 w-3.5" style={{ color: S.color }} aria-hidden />
            {c[s]} {S.label.toLowerCase()}
          </span>
        );
      })}
    </span>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<{ settings: Settings; suppliers: Row[] } | null>(null);
  const [error, setError] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const origin = useOrigin();

  const load = useCallback(() => {
    fetch("/api/dashboard").then((r) => r.json()).then(setData).catch(() => setError(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function loadDemo() {
    if (data?.suppliers.length && !confirm("Replace all current data with the demo workspace?")) return;
    setSeeding(true);
    await fetch("/api/demo", { method: "POST" });
    setSeeding(false);
    load();
  }

  const rows = data?.suppliers ?? [];
  const onboarded = rows.filter((r) => r.status === "submitted" || r.status === "verified").length;
  const saving = rows.reduce((a, r) => a + r.savingEur, 0);
  const avgQ = rows.length ? Math.round(rows.reduce((a, r) => a + r.score.quality, 0) / rows.length) : 0;
  const ready = rows.filter((r) => r.score.verificationReady).length;
  const s = data?.settings;

  return (
    <div className="rise space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Supplier emissions</h1>
          <p className="mt-1 text-[15px] text-slate-500">{s?.exporterName ?? "…"} · reporting year {s?.reportingYear ?? "…"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/export" className={btn.secondary}><Download className="h-4 w-4" aria-hidden /> Buyer CSV</a>
          <button onClick={loadDemo} disabled={seeding} className={btn.secondary}>
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} {rows.length ? "Reset demo" : "Load demo"}
          </button>
          <Link href="/suppliers/new" className={btn.primary}><UserPlus className="h-4 w-4" aria-hidden /> Invite supplier</Link>
        </div>
      </div>

      {error && <Card className="p-6 text-sm text-rose-700">Could not load data. Is the server running?</Card>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data ? (
          <>
            <StatTile label="Suppliers submitted" value={`${onboarded} / ${rows.length}`} hint="Invited suppliers who have sent their data" Icon={Users} />
            <StatTile label={`CBAM cost avoided, ${s!.reportingYear}`} value={eur(saving)} hint={<>{inr(saving * s!.eurInr)} at today&apos;s EU tonnages, vs default values</>} Icon={IndianRupee} />
            <StatTile label="Average data quality" value={`${avgQ}/100`} hint="Penalised by every open flag" Icon={Gauge} />
            <StatTile label="Verifier-ready" value={`${ready} / ${rows.length}`} hint="No critical or major flags, ≥80% complete" Icon={FileCheck2} />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px]" />)
        )}
      </div>

      <Card>
        <CardHeader title="Suppliers" subtitle="Specific embedded emissions (tCO₂e per tonne) of each product against the EU default value" />
        {!data ? (
          <div className="space-y-3 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !rows.length ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[15px] font-medium text-slate-800">No suppliers yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Load the demo (a wire-rod mill, a fastener maker that buys its rod, an aluminium extruder and a cement grinder) or invite your first supplier.</p>
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={loadDemo} className={btn.primary}><Sparkles className="h-4 w-4" aria-hidden /> Load demo</button>
              <Link href="/suppliers/new" className={btn.secondary}>Invite supplier</Link>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="grid grid-cols-1 gap-3 px-5 py-4 transition hover:bg-slate-50/70 sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_150px_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Grade grade={r.score.grade} />
                    <Link href={`/suppliers/${r.id}`} className="truncate font-medium text-slate-900 hover:underline">{r.name}</Link>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <StatusPill status={r.status} />
                    <span>{r.city}{r.state ? `, ${r.state}` : ""}</span>
                    <span>· {r.evidenceCount} docs · {fmt(r.months, 0)} mo</span>
                  </div>
                </div>
                <div className="min-w-0 space-y-1">
                  {r.products.map((p) => (
                    <div key={p.name} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate text-slate-700">{p.name} <span className="font-mono text-[11px] text-slate-400">{p.cnCode}</span></span>
                      <span className="num shrink-0 text-slate-900">
                        {p.outputTonnes ? fmt(p.seePriced) : "–"} <span className="text-xs text-slate-400">vs {fmt(p.defaultPriced)}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Meter value={r.score.quality} />
                  <Counts c={r.counts} />
                </div>
                <div className="flex items-center gap-1.5 lg:justify-end">
                  {r.status === "invited" && r.phone && (
                    <a className={btn.whatsapp} href={whatsappInvite(r.language, r.phone, s!.exporterName, `${origin}/s/${r.portalToken}`)} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-4 w-4" aria-hidden /> Invite
                    </a>
                  )}
                  {r.savingEur > 0 && <span className="num rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">saves {eur(r.savingEur)}</span>}
                  <Link href={`/suppliers/${r.id}`} className={btn.ghost} aria-label={`Open ${r.name}`}><ChevronRight className="h-4 w-4" aria-hidden /></Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
