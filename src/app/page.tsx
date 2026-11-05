"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, CircleCheck, FileSearch, Gauge, OctagonAlert, Plus, Upload } from "lucide-react";
import { Card, DOC_ICON, Meter, RISK, SEV, SeverityBar, Skeleton, StatTile, StatusPill, btn } from "@/components/ui";
import { plural, timeAgo } from "@/lib/format";
import { DOC_TYPE_LABELS, type CheckStatus, type DocType, type Severity } from "@/lib/types";

type Summary = {
  id: string;
  name: string;
  createdAt: string;
  status: CheckStatus;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  docCount: number;
  docTypes: DocType[];
  openFindings: number;
  counts: Partial<Record<Severity, number>>;
};

function CountsLegend({ counts }: { counts: Partial<Record<Severity, number>> }) {
  const parts = (["critical", "major", "minor"] as const).filter((s) => (counts[s] ?? 0) > 0);
  if (!parts.length) return <span className="text-xs text-slate-500">No open issues</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
      {parts.map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: SEV[s].color }} aria-hidden />
          {counts[s]} {SEV[s].label.toLowerCase()}
        </span>
      ))}
    </span>
  );
}

export default function Dashboard() {
  const [checks, setChecks] = useState<Summary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/checks").then((r) => r.json()).then(setChecks).catch(() => setError(true));
  }, []);

  const n = checks?.length ?? 0;
  const serious = checks?.reduce((a, c) => a + (c.counts.critical ?? 0) + (c.counts.major ?? 0), 0) ?? 0;
  const clear = checks?.filter((c) => c.status === "clear").length ?? 0;
  const avgRisk = n ? Math.round(checks!.reduce((a, c) => a + c.riskScore, 0) / n) : 0;

  return (
    <div className="rise space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Shipments</h1>
          <p className="mt-1 text-[15px] text-slate-500">Every document set you&apos;ve checked, riskiest first.</p>
        </div>
        <Link href="/new" className={btn.primary}><Plus className="h-4 w-4" aria-hidden /> New check</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {checks === null ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-2xl" />)
        ) : (
          <>
            <StatTile label="Shipments checked" value={n} Icon={FileSearch} hint={n ? `Last ${timeAgo(checks[0].createdAt)}` : "None yet"} />
            <StatTile label="Open serious issues" value={serious} Icon={OctagonAlert} hint="Critical + major, not yet resolved" />
            <StatTile label="Clear to file" value={<>{clear}<span className="text-lg font-medium text-slate-400"> / {n}</span></>} Icon={CircleCheck} hint="Sets with no open issues" />
            <StatTile label="Average risk" value={avgRisk} Icon={Gauge} hint="0 = consistent, 100 = will be rejected" />
          </>
        )}
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-[15px] font-semibold">All checks</h2>
          {n > 0 && <span className="text-[13px] text-slate-500">{plural(n, "shipment")}</span>}
        </div>

        {error ? (
          <p className="p-6 text-sm text-red-700">Could not load checks. Is the server running?</p>
        ) : checks === null ? (
          <div className="space-y-3 p-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : n === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 ring-1 ring-teal-100"><Upload className="h-6 w-6 text-teal-700" aria-hidden /></div>
            <h3 className="mt-4 text-base font-semibold">No shipments checked yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Upload a document set, or run one of the sample shipments to see what a report looks like.</p>
            <Link href="/new" className={`${btn.primary} mt-5`}>Start a check</Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...checks].sort((a, b) => b.riskScore - a.riskScore || b.createdAt.localeCompare(a.createdAt)).map((c) => (
              <li key={c.id}>
                <Link href={`/checks/${c.id}`} className="group grid grid-cols-1 items-center gap-x-6 gap-y-3 px-6 py-4 transition hover:bg-slate-50/80 md:grid-cols-[minmax(0,1fr)_220px_140px_20px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="truncate text-[15px] font-semibold text-slate-900 group-hover:text-teal-800">{c.name}</span>
                      <StatusPill status={c.status} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex -space-x-1">
                        {c.docTypes.map((t, i) => {
                          const Icon = DOC_ICON[t];
                          return (
                            <span key={i} title={DOC_TYPE_LABELS[t]} className="grid h-5 w-5 place-items-center rounded-md bg-white ring-1 ring-slate-200">
                              <Icon className="h-3 w-3 text-slate-500" aria-hidden />
                            </span>
                          );
                        })}
                      </span>
                      <span>{plural(c.docCount, "document")}</span>
                      <span aria-hidden>·</span>
                      <span>{timeAgo(c.createdAt)}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <SeverityBar counts={c.counts} className="h-1.5" />
                    <CountsLegend counts={c.counts} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg font-semibold text-slate-900">{c.riskScore}</span>
                      <span className="text-xs text-slate-500">{RISK[c.riskLevel].label}</span>
                    </div>
                    <Meter value={c.riskScore} level={c.riskLevel} />
                  </div>
                  <ChevronRight className="hidden h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 md:block" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
