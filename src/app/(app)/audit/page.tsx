"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardHeader, Skeleton } from "@/components/ui";
import type { AuditEntry } from "@/lib/types";

export default function AuditPage() {
  const [data, setData] = useState<{ chain: { ok: boolean; brokenAt: number | null }; entries: AuditEntry[] } | null>(null);
  useEffect(() => {
    fetch("/api/audit").then((r) => r.json()).then(setData);
  }, []);
  return (
    <div className="rise space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Audit trail</h1>
        <p className="mt-1 max-w-3xl text-[15px] text-slate-500">Every upload, edit, confirmation, query and sign-off. Each entry&apos;s SHA-256 hash covers the previous entry, so changing or deleting history breaks the chain from that point on.</p>
      </div>
      {!data ? <Skeleton className="h-64" /> : (
        <>
          <Card className={`flex items-center gap-3 p-5 ${data.chain.ok ? "text-emerald-800" : "text-rose-700"}`}>
            {data.chain.ok ? <ShieldCheck className="h-6 w-6" aria-hidden /> : <ShieldAlert className="h-6 w-6" aria-hidden />}
            <div className="text-sm font-medium">{data.chain.ok ? `Chain intact: ${data.entries.length} most recent entries shown, all hashes verify.` : `Chain broken at entry #${data.chain.brokenAt}: the log was edited outside the app.`}</div>
          </Card>
          <Card>
            <CardHeader title="Entries" subtitle="Newest first" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2">#</th><th className="px-4 py-2">When</th><th className="px-4 py-2">Who</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Detail</th><th className="px-4 py-2">Hash</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.entries.map((e) => (
                    <tr key={e.seq} className="align-top">
                      <td className="num px-4 py-2 text-slate-400">{e.seq}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-600">{new Date(e.at).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-2 text-xs">{e.actor}</td>
                      <td className="px-4 py-2 font-medium text-slate-800">{e.action}</td>
                      <td className="max-w-md px-4 py-2 text-xs text-slate-600">{e.detail}</td>
                      <td className="px-4 py-2 font-mono text-[10px] text-slate-400" title={e.hash}>{e.hash.slice(0, 12)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
