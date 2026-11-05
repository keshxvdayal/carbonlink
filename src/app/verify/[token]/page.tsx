"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Check, FileText, Fingerprint, Loader2, MessageSquareWarning, Printer, ShieldAlert, ShieldCheck } from "lucide-react";
import { DOC_LABEL, KIND_LABEL } from "@/components/activity-table";
import { Logo } from "@/components/shell";
import { Card, CardHeader, SeverityBadge, btn, cx, input } from "@/components/ui";
import { FUEL_FACTORS, ROUTES } from "@/lib/factors";
import type { Scorecard } from "@/lib/flags";
import { fmt, timeAgo } from "@/lib/format";
import type { AuditEntry, Flag, InstallationResult, Settings, Supplier } from "@/lib/types";

type V = {
  supplier: Omit<Supplier, "portalToken">;
  result: { inst: InstallationResult; flags: Flag[]; score: Scorecard };
  upstream: { precursorId: string; supplierName: string; productName: string }[];
  settings: Settings;
  audit: { chain: { ok: boolean; brokenAt: number | null }; entries: AuditEntry[] };
};

async function sha256Hex(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function VerifierPage() {
  const { token } = useParams<{ token: string }>();
  const [v, setV] = useState<V | null>(null);
  const [missing, setMissing] = useState(false);
  const [author, setAuthor] = useState(() => {
    try {
      return typeof window === "undefined" ? "" : localStorage.getItem("cl-verifier") ?? "";
    } catch {
      return "";
    }
  });
  const [draft, setDraft] = useState<{ rowId: string | null; text: string } | null>(null);
  const [hashes, setHashes] = useState<Record<string, "checking" | "ok" | "bad">>({});
  const [sign, setSign] = useState({ by: "", statement: "Reasonable assurance: activity data agrees with source documents sampled; calculation re-performed without material misstatement." });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/verify/${token}`).then(async (r) => (r.ok ? setV(await r.json()) : setMissing(true)));
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  async function post(body: object) {
    setErr(null);
    const r = await fetch(`/api/verify/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const b = await r.json();
    if (!r.ok) return setErr(b.error);
    try { if (author) localStorage.setItem("cl-verifier", author); } catch {}
    setDraft(null);
    load();
  }

  async function checkHash(sha: string) {
    setHashes((h) => ({ ...h, [sha]: "checking" }));
    const r = await fetch(`/api/evidence/${sha}?t=${token}`);
    const got = await sha256Hex(await r.arrayBuffer());
    setHashes((h) => ({ ...h, [sha]: got === sha ? "ok" : "bad" }));
  }

  if (missing) return <div className="grid min-h-screen place-items-center text-slate-600">Link not valid.</div>;
  if (!v) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" aria-hidden /></div>;
  const s = v.supplier;
  const { inst, flags, score } = v.result;
  const evById = new Map(s.evidence.map((e) => [e.id, e]));
  const openQueries = s.comments.filter((c) => c.status === "query").length;

  return (
    <div className="min-h-screen">
      <header className="no-print flex items-center justify-between bg-[#0a1512] px-4 py-3 sm:px-8">
        <Logo />
        <span className="text-xs font-medium uppercase tracking-wider text-emerald-300">Verifier workspace</span>
      </header>
      <main className="mx-auto max-w-[1100px] space-y-6 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Evidence pack · {v.settings.exporterName}</p>
            <h1 className="text-[26px] font-semibold tracking-tight">{s.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{s.city}, {s.state} · period {inst.periodStart} → {inst.periodEnd} ({inst.months} months) · data quality {score.quality}/100</p>
          </div>
          <div className="no-print flex gap-2">
            <button className={btn.secondary} onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Print pack</button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className={cx("flex items-center gap-3 p-4 text-sm font-medium", v.audit.chain.ok ? "text-emerald-800" : "text-rose-700")}>
            {v.audit.chain.ok ? <ShieldCheck className="h-5 w-5" aria-hidden /> : <ShieldAlert className="h-5 w-5" aria-hidden />}
            {v.audit.chain.ok ? "Audit chain intact" : `Audit chain broken at #${v.audit.chain.brokenAt}`}
          </Card>
          <Card className="flex items-center gap-3 p-4 text-sm font-medium text-slate-700"><MessageSquareWarning className="h-5 w-5 text-amber-600" aria-hidden /> {openQueries} open quer{openQueries === 1 ? "y" : "ies"}</Card>
          <Card className={cx("flex items-center gap-3 p-4 text-sm font-medium", s.verification ? "text-emerald-800" : "text-slate-600")}><BadgeCheck className="h-5 w-5" aria-hidden /> {s.verification ? `Signed off by ${s.verification.by}` : "Not signed off"}</Card>
        </div>

        <Card>
          <CardHeader title="Calculation" subtitle="SEE = (site direct emissions × mass share + Σ precursor tonnes × precursor SEE) ÷ output" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">Route</th><th className="px-4 py-2 text-right">Output t</th><th className="px-4 py-2 text-right">Attributed tCO₂</th><th className="px-4 py-2 text-right">Precursors tCO₂</th><th className="px-4 py-2 text-right">SEE direct</th><th className="px-4 py-2 text-right">SEE indirect</th></tr></thead>
              <tbody className="num divide-y divide-slate-100">
                {inst.products.map((p) => (
                  <tr key={p.productId}><td className="px-4 py-2">{p.name} <span className="font-mono text-[11px] text-slate-400">{p.cnCode}</span></td><td className="px-4 py-2 text-xs text-slate-600">{ROUTES[s.products.find((x) => x.id === p.productId)?.route ?? ""]?.label}</td><td className="px-4 py-2 text-right">{fmt(p.outputTonnes, 1)}</td><td className="px-4 py-2 text-right">{fmt(p.attributedDirect, 2)}</td><td className="px-4 py-2 text-right">{fmt(p.precursorDirect, 2)}{p.usesDefaultPrecursor ? "*" : ""}</td><td className="px-4 py-2 text-right font-semibold">{p.seeDirect.toFixed(4)}</td><td className="px-4 py-2 text-right">{p.seeIndirect.toFixed(4)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 border-t border-slate-100 p-5 text-xs text-slate-600 sm:grid-cols-2">
            <div>
              <div className="font-semibold text-slate-700">Combustion</div>
              {inst.fuelEmissions.map((f) => <div key={f.fuel} className="num">{FUEL_FACTORS[f.fuel].label}: {fmt(f.quantity, 0)} {f.unit} × NCV {FUEL_FACTORS[f.fuel].ncvGJ.toFixed(4)} GJ/{f.unit} × {FUEL_FACTORS[f.fuel].efPerTJ} tCO₂/TJ = {fmt(f.tco2, 2)} t</div>)}
              <div className="num">Process inputs: {fmt(inst.processEmissions, 2)} t · Total direct {fmt(inst.directTotal, 2)} t</div>
            </div>
            <div>
              <div className="font-semibold text-slate-700">Electricity & precursors</div>
              <div className="num">{fmt(inst.electricityMWh, 2)} MWh × {v.settings.gridEf} tCO₂/MWh = {fmt(inst.indirectTotal, 2)} t indirect</div>
              {s.products.flatMap((p) => p.precursors.map((pc) => <div key={pc.id}>{p.name} ← {pc.name}: {pc.source === "passport" ? `passport of ${v.upstream.find((u) => u.precursorId === pc.id)?.supplierName}` : pc.source === "default" ? `EU default ${pc.seeDirect}` : `actual ${pc.seeDirect}`} t/t</div>))}
              <div className="mt-1 text-slate-400">* includes precursors on default values</div>
            </div>
          </div>
        </Card>

        {flags.length > 0 && (
          <Card>
            <CardHeader title="Automated checks still open" />
            <ul className="divide-y divide-slate-100">{flags.map((f) => <li key={f.id} className="flex gap-3 px-5 py-3 text-sm"><SeverityBadge severity={f.severity} /><div><span className="font-medium">{f.title}</span><p className="text-xs text-slate-500">{f.detail}</p></div></li>)}</ul>
          </Card>
        )}

        <Card>
          <CardHeader title="Source documents" subtitle="Re-compute each file's SHA-256 in your browser to confirm it is the file that was uploaded." />
          <ul className="divide-y divide-slate-100">
            {s.evidence.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <a className="inline-flex items-center gap-1 font-medium text-emerald-800 hover:underline" href={`/api/evidence/${e.sha256}?t=${token}`} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" aria-hidden /> {e.fileName}</a>
                  <div className="text-xs text-slate-500">{DOC_LABEL[e.data.docType]} · {e.data.issuer ?? "?"} · ref {e.data.accountRef ?? "?"} · uploaded by {e.uploadedBy} {timeAgo(e.uploadedAt)}</div>
                  <div className="font-mono text-[10px] text-slate-400">{e.sha256}</div>
                </div>
                <button className={cx(btn.ghost, "no-print")} onClick={() => checkHash(e.sha256)}>
                  {hashes[e.sha256] === "checking" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Fingerprint className="h-4 w-4" aria-hidden />}
                  {hashes[e.sha256] === "ok" ? "Hash matches" : hashes[e.sha256] === "bad" ? "HASH MISMATCH" : "Verify hash"}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Activity data" subtitle="Accept a value after sampling it to its document, or raise a query." />
          <div className="no-print border-b border-slate-100 px-5 py-3"><label className="text-xs text-slate-600">Your name <input className={`${input} mt-1 max-w-xs`} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Verifier name, firm" /></label></div>
          <ul className="divide-y divide-slate-100">
            {s.activity.map((r) => {
              const ev = r.evidenceId ? evById.get(r.evidenceId) : undefined;
              const cs = s.comments.filter((c) => c.rowId === r.id);
              const accepted = cs.some((c) => c.status === "accepted");
              return (
                <li key={r.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800">{KIND_LABEL[r.kind]}{r.fuel ? `: ${FUEL_FACTORS[r.fuel].label}` : r.material ? `: ${r.material}` : ""} <span className="num ml-2 text-slate-900">{fmt(r.quantity, r.quantity % 1 ? 2 : 0)} {r.unit}</span></div>
                      <div className="text-xs text-slate-500">{r.periodStart} → {r.periodEnd} · {ev ? ev.fileName : "no document"} · {r.confirmed ? "confirmed by supplier/exporter" : "unconfirmed"} · read by {r.origin}</div>
                      {r.sourceQuote && <div className="font-mono text-[11px] text-slate-500">“{r.sourceQuote}”</div>}
                    </div>
                    <div className="no-print flex gap-1">
                      {accepted ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" aria-hidden /> Accepted</span> : <button className={btn.ghost} onClick={() => post({ action: "comment", author, rowId: r.id, text: "Agreed to source document.", status: "accepted" })}><Check className="h-3.5 w-3.5" aria-hidden /> Accept</button>}
                      <button className={btn.ghost} onClick={() => setDraft({ rowId: r.id, text: "" })}>Query</button>
                    </div>
                  </div>
                  {cs.filter((c) => c.status !== "accepted").map((c) => <p key={c.at} className={cx("mt-1 rounded-md px-2 py-1 text-xs", c.status === "query" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-500 line-through")}>{c.author}: {c.text}</p>)}
                  {draft?.rowId === r.id && (
                    <div className="no-print mt-2 flex gap-2">
                      <input autoFocus className={input} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="e.g. Bill shows 141,250 kWh but meter reading difference is 139,900" />
                      <button className={btn.primary} onClick={() => post({ action: "comment", author, rowId: r.id, text: draft.text, status: "query" })}>Send</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {s.comments.length > 0 && (
          <Card>
            <CardHeader title="Queries" />
            <ul className="divide-y divide-slate-100 text-sm">
              {s.comments.map((c, i) => c.status !== "accepted" && (
                <li key={i} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div><span className="font-medium">{c.author}</span> <span className="text-xs text-slate-400">{timeAgo(c.at)} · {c.status}</span><p className={c.status === "resolved" ? "text-slate-400 line-through" : "text-slate-700"}>{c.text}</p></div>
                  {c.status === "query" && <button className={cx(btn.ghost, "no-print")} onClick={() => post({ action: "resolve", index: i })}>Mark resolved</button>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-5 sm:p-6">
          <h2 className="text-[15px] font-semibold">Verification statement</h2>
          {s.verification ? (
            <div className="mt-2 text-sm">
              <p className="text-slate-800">{s.verification.statement}</p>
              <p className="mt-1 text-xs text-slate-500">{s.verification.by} · {new Date(s.verification.at).toLocaleString("en-IN")}</p>
              <button className={cx(btn.ghost, "no-print mt-2")} onClick={() => post({ action: "reopen", by: author })}>Reopen</button>
            </div>
          ) : (
            <div className="no-print mt-3 space-y-3">
              <input className={input} value={sign.by} onChange={(e) => setSign({ ...sign, by: e.target.value })} placeholder="Name, firm, accreditation no." />
              <textarea className={`${input} min-h-20`} value={sign.statement} onChange={(e) => setSign({ ...sign, statement: e.target.value })} />
              <button className={btn.primary} disabled={openQueries > 0} onClick={() => post({ action: "signoff", ...sign })}><BadgeCheck className="h-4 w-4" aria-hidden /> Sign off</button>
              {openQueries > 0 && <p className="text-xs text-slate-500">Resolve the {openQueries} open quer{openQueries === 1 ? "y" : "ies"} first.</p>}
            </div>
          )}
          {err && <p className="mt-2 text-sm text-rose-700">{err}</p>}
        </Card>
      </main>
    </div>
  );
}
