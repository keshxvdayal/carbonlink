"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BadgeCheck, CheckCheck, Copy, Download, ExternalLink, FileSpreadsheet, Globe2, Lightbulb, Loader2, MessageCircle, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import { ActivityTable, DOC_LABEL } from "@/components/activity-table";
import { ProductEditor, type UpstreamOption } from "@/components/product-editor";
import { Card, CardHeader, Grade, Meter, SeverityBadge, Skeleton, StatusPill, btn, cx } from "@/components/ui";
import { FUEL_FACTORS, ROUTES, SECTOR_LABEL, UK_CBAM_SECTORS, defaultMarkup } from "@/lib/factors";
import type { Scorecard } from "@/lib/flags";
import { fmt, timeAgo } from "@/lib/format";
import { LANG_LABEL, whatsappInvite } from "@/lib/i18n";
import type { Suggestion } from "@/lib/suggestions";
import { useOrigin } from "@/lib/use-origin";
import type { ActivityRow, AuditEntry, Flag, InstallationResult, Product, Settings, Supplier } from "@/lib/types";

type View = { supplier: Supplier; result: { inst: InstallationResult; flags: Flag[]; score: Scorecard }; upstream: { precursorId: string; supplierName: string; productName: string }[]; settings: Settings; suggestions: Suggestion[] };
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "data", label: "Data & evidence" },
  { key: "flags", label: "Flags" },
  { key: "products", label: "Products & routes" },
  { key: "share", label: "Share & export" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/* ------------------------------------------------------------------ */

function Compare({ actual, def, markup }: { actual: number; def: number | null; markup: number }) {
  if (def === null) return null;
  const withMarkup = def * (1 + markup);
  const max = Math.max(actual, withMarkup, 0.01);
  const bars = [
    { label: "Actual (this data)", v: actual, color: "var(--series-actual)" },
    { label: `EU default + ${Math.round(markup * 100)}% mark-up`, v: withMarkup, color: "var(--series-default)" },
  ];
  return (
    <div className="space-y-2" role="img" aria-label={`Actual ${actual.toFixed(2)} versus default with mark-up ${withMarkup.toFixed(2)} tCO2e per tonne`}>
      {bars.map((b) => (
        <div key={b.label}>
          <div className="flex justify-between text-xs text-slate-600"><span>{b.label}</span><span className="num font-medium text-slate-900">{b.v.toFixed(2)}</span></div>
          <div className="mt-1 h-2.5 w-full rounded-full bg-slate-100"><div className="h-full rounded-r-[4px] rounded-l-full" style={{ width: `${Math.max((b.v / max) * 100, 1)}%`, background: b.color }} /></div>
        </div>
      ))}
    </div>
  );
}

function Overview({ v }: { v: View }) {
  const { inst, score, flags } = v.result;
  const s = v.supplier;
  const markup = defaultMarkup(v.settings.reportingYear);
  const route = ROUTES[s.products[0]?.route ?? ""];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {inst.products.map((p) => {
          const prod = s.products.find((x) => x.id === p.productId);
          return (
            <Card key={p.productId}>
              <CardHeader
                title={p.name}
                subtitle={<><span className="font-mono">{p.cnCode}</span> · {p.sector ? SECTOR_LABEL[p.sector] : "unknown sector"} · {ROUTES[prod?.route ?? ""]?.label}</>}
                action={p.sector && UK_CBAM_SECTORS.includes(p.sector) ? <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-800"><Globe2 className="h-3.5 w-3.5" aria-hidden /> EU + UK CBAM scope</span> : null}
              />
              {p.outputTonnes === 0 ? (
                <p className="px-6 py-6 text-sm text-slate-500">No production recorded for this product yet.</p>
              ) : (
                <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
                  <div>
                    <div className="text-[13px] text-slate-500">Embedded emissions priced by CBAM</div>
                    <div className="num mt-1 text-3xl font-semibold tracking-tight">{p.seePriced.toFixed(3)} <span className="text-base font-normal text-slate-500">tCO₂e/t</span></div>
                    <dl className="mt-4 space-y-1.5 text-sm">
                      {[
                        ["Output", `${fmt(p.outputTonnes, 1)} t (${Math.round(p.massShare * 100)}% of site output)`],
                        ["Site direct emissions attributed", `${fmt(p.attributedDirect, 1)} tCO₂`],
                        ["Precursors (embedded)", `${fmt(p.precursorDirect, 1)} tCO₂${p.usesDefaultPrecursor ? " · on defaults" : ""}`],
                        ["SEE direct / indirect", `${p.seeDirect.toFixed(3)} / ${p.seeIndirect.toFixed(3)}`],
                      ].map(([k, val]) => (
                        <div key={k} className="flex justify-between gap-4"><dt className="text-slate-500">{k}</dt><dd className="num text-right text-slate-900">{val}</dd></div>
                      ))}
                    </dl>
                  </div>
                  <div className="space-y-3">
                    <div className="text-[13px] text-slate-500">vs EU default value ({v.settings.reportingYear})</div>
                    <Compare actual={p.seePriced} def={p.defaultPriced} markup={markup} />
                    {p.defaultPriced !== null && prod && prod.euTonnesPerYear > 0 && (
                      <Link href={`/simulator?supplier=${s.id}&product=${p.productId}`} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-800 hover:underline">See the money this saves →</Link>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        <Card>
          <CardHeader title="Installation" subtitle={inst.periodStart ? `${inst.periodStart} → ${inst.periodEnd} · ${inst.months} months` : "No dated data yet"} />
          <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Direct emissions</h3>
              <table className="mt-2 w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {inst.fuelEmissions.map((f) => (
                    <tr key={f.fuel}><td className="py-1.5 text-slate-700">{FUEL_FACTORS[f.fuel].label}<div className="text-xs text-slate-400">{fmt(f.quantity, 0)} {f.unit} · {fmt(f.energyGJ, 0)} GJ</div></td><td className="num py-1.5 text-right">{fmt(f.tco2, 1)} t</td></tr>
                  ))}
                  {inst.processEmissions > 0 && <tr><td className="py-1.5">Electrodes / carbon</td><td className="num py-1.5 text-right">{fmt(inst.processEmissions, 1)} t</td></tr>}
                  <tr className="font-semibold"><td className="py-1.5">Total direct</td><td className="num py-1.5 text-right">{fmt(inst.directTotal, 1)} tCO₂</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Electricity & intensity</h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Grid</dt><dd className="num">{fmt(inst.electricityMWh, 1)} MWh</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Renewable claimed</dt><dd className="num">{fmt(inst.renewableMWh, 1)} MWh</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Indirect ({v.settings.gridEf} t/MWh)</dt><dd className="num">{fmt(inst.indirectTotal, 1)} tCO₂</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">kWh per tonne</dt><dd className="num">{fmt(inst.intensity.kwhPerT, 0)} {route && <span className="text-xs text-slate-400">(usual {route.kwhPerT[0]}–{route.kwhPerT[1]})</span>}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Fuel GJ per tonne</dt><dd className="num">{fmt(inst.intensity.fuelGJPerT, 2)} {route && <span className="text-xs text-slate-400">(usual {route.fuelGJPerT[0]}–{route.fuelGJPerT[1]})</span>}</dd></div>
              </dl>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex items-center justify-between"><span className="text-[13px] font-medium text-slate-500">Supplier scorecard</span><Grade grade={score.grade} /></div>
          <div className="mt-4 space-y-3 text-sm">
            <div><div className="flex justify-between"><span>Data quality</span><span className="num font-medium">{score.quality}/100</span></div><div className="mt-1"><Meter value={score.quality} /></div></div>
            <div><div className="flex justify-between"><span>Completeness</span><span className="num font-medium">{score.completeness}%</span></div><div className="mt-1"><Meter value={score.completeness} /></div></div>
            <div className={cx("flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium", score.verificationReady ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-600")}>
              <ShieldCheck className="h-4 w-4" aria-hidden /> {score.verificationReady ? "Ready for the verifier" : `${flags.filter((f) => f.severity === "critical" || f.severity === "major").length} blocking flag(s) before verification`}
            </div>
            {s.verification && <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Verified by {s.verification.by}, {timeAgo(s.verification.at)}</div>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Reduction ideas" subtitle="For the supplier conversation" />
          <ul className="space-y-3 p-5 text-sm">
            {v.suggestions.map((g, i) => (
              <li key={i} className="flex gap-2.5">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                <div><div className="font-medium text-slate-800">{g.title}</div><div className="text-xs leading-relaxed text-slate-500">{g.detail}</div></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DataTab({ v, reload, setView }: { v: View; reload: () => void; setView: (x: View) => void }) {
  const s = v.supplier;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }[]>([]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMsg([]);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    const res = await fetch(`/api/suppliers/${s.id}/evidence`, { method: "POST", body: fd });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg([{ ok: false, text: body.error }]);
    setMsg(body.results.map((r: { name: string; rows: number; error?: string }) => ({ ok: !r.error, text: r.error ? `${r.name}: ${r.error}` : `${r.name}: ${r.rows} value(s) read` })));
    if (fileRef.current) fileRef.current.value = "";
    reload();
  }

  async function patch(rowIds: string[], p: Partial<ActivityRow>) {
    const res = await fetch(`/api/suppliers/${s.id}/rows`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rowIds, ...p }) });
    const body = await res.json();
    if (!res.ok) return alert(body.error);
    setView(body);
  }
  async function del(rowId: string) {
    const res = await fetch(`/api/suppliers/${s.id}/rows?row=${rowId}`, { method: "DELETE" });
    if (res.ok) setView(await res.json());
  }
  async function addManual() {
    const res = await fetch(`/api/suppliers/${s.id}/rows`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "electricity", quantity: 0, unit: "kWh" }) });
    if (res.ok) setView(await res.json());
  }

  const unconfirmed = s.activity.filter((r) => !r.confirmed && !r.lowConfidence).map((r) => r.id);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Evidence vault" subtitle="Originals are stored by SHA-256 hash: any later change to a file is detectable." />
        <div className="p-5 sm:p-6">
          <label
            className={cx("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition", busy ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin text-emerald-700" aria-hidden /> : <Upload className="h-6 w-6 text-slate-400" aria-hidden />}
            <span className="text-sm font-medium text-slate-700">{busy ? "Reading documents…" : "Drop electricity bills, fuel invoices, weighbridge slips, registers"}</span>
            <span className="text-xs text-slate-500">PDF, JPG, PNG, WEBP or TXT · up to 20 files</span>
            <input ref={fileRef} type="file" multiple className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" onChange={(e) => upload(e.target.files)} disabled={busy} />
          </label>
          {msg.length > 0 && <ul className="mt-3 space-y-1 text-sm">{msg.map((m, i) => <li key={i} className={m.ok ? "text-emerald-700" : "text-rose-700"}>{m.text}</li>)}</ul>}
          {s.evidence.length > 0 && (
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {s.evidence.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <a href={`/api/evidence/${e.sha256}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-800 hover:underline">{e.fileName}</a>
                    <div className="text-xs text-slate-500">{DOC_LABEL[e.data.docType]} · {e.data.periodStart ?? "?"}{e.data.periodEnd && e.data.periodEnd !== e.data.periodStart ? ` → ${e.data.periodEnd}` : ""} · by {e.uploadedBy}</div>
                    <div className="font-mono text-[10px] text-slate-400" title={e.sha256}>sha256 {e.sha256.slice(0, 20)}…</div>
                  </div>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600">{e.extractedBy === "claude" ? "AI" : e.extractedBy}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Activity data"
          subtitle="Every number used in the calculation, linked to the line on the document it came from"
          action={
            <div className="flex gap-2">
              <button className={btn.secondary} onClick={addManual}><Plus className="h-4 w-4" aria-hidden /> Manual value</button>
              {unconfirmed.length > 0 && <button className={btn.secondary} onClick={() => patch(unconfirmed, { confirmed: true })}><CheckCheck className="h-4 w-4" aria-hidden /> Confirm {unconfirmed.length} clear values</button>}
            </div>
          }
        />
        <ActivityTable rows={s.activity} evidence={s.evidence} products={s.products} onPatch={patch} onDelete={del} evidenceHref={(e) => `/api/evidence/${e.sha256}`} highlight={new Set(s.activity.filter((r) => r.lowConfidence && !r.confirmed).map((r) => r.id))} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FlagsTab({ v, go }: { v: View; go: (t: Tab) => void }) {
  const flags = v.result.flags;
  if (!flags.length) return <Card className="p-10 text-center text-sm text-slate-600">No flags. The data is internally consistent.</Card>;
  return (
    <Card>
      <CardHeader title={`${flags.length} flag(s)`} subtitle="Rule-based checks a verifier would run. Fix the data at source, then re-check." />
      <ul className="divide-y divide-slate-100">
        {flags.map((f) => (
          <li key={f.id} className="flex gap-3 px-5 py-4 sm:px-6">
            <SeverityBadge severity={f.severity} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">{f.title} <span className="ml-1 font-mono text-[11px] text-slate-400">{f.rule}</span></div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{f.detail}</p>
              {f.rowIds.length > 0 && <button className="mt-1 text-xs font-medium text-emerald-800 hover:underline" onClick={() => go("data")}>View {f.rowIds.length} related value(s) →</button>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ProductsTab({ v, setView }: { v: View; setView: (x: View) => void }) {
  const [products, setProducts] = useState<Product[]>(v.supplier.products);
  const [upstream, setUpstream] = useState<UpstreamOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/suppliers").then((r) => r.json()).then((all: UpstreamOption[]) => setUpstream(all.filter((u) => u.supplierId !== v.supplier.id))).catch(() => {});
  }, [v.supplier.id]);
  async function save() {
    setSaving(true);
    setErr(null);
    const res = await fetch(`/api/suppliers/${v.supplier.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ products }) });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) return setErr(body.error);
    setView(body);
    setProducts(body.supplier.products);
  }
  return (
    <Card>
      <CardHeader title="Products, CN codes & production routes" subtitle="Link a precursor to another supplier's passport to roll their actual footprint into this product (multi-tier)." action={<button className={btn.primary} onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save</button>} />
      <div className="p-5 sm:p-6">
        <ProductEditor products={products} onChange={setProducts} upstream={upstream} />
        {err && <p className="mt-3 text-sm text-rose-700">{err}</p>}
      </div>
    </Card>
  );
}

function CopyLink({ label, url, hint, children }: { label: string; url: string; hint: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="text-sm font-medium text-slate-900">{label}</div>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">{url}</code>
        <button className={btn.ghost} onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy className="h-3.5 w-3.5" aria-hidden /> {copied ? "Copied" : "Copy"}</button>
        <a className={btn.ghost} href={url} target="_blank" rel="noreferrer" aria-label={`Open ${label}`}><ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
      </div>
      {children}
    </div>
  );
}

function ShareTab({ v }: { v: View }) {
  const s = v.supplier;
  const router = useRouter();
  const origin = useOrigin();
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  useEffect(() => {
    fetch(`/api/audit?supplier=${s.id}`).then((r) => r.json()).then((b) => setAudit(b.entries)).catch(() => {});
  }, [s.id]);
  const portal = `${origin}/s/${s.portalToken}`;
  async function remove() {
    if (!confirm(`Delete ${s.name} and all its data? This cannot be undone.`)) return;
    await fetch(`/api/suppliers/${s.id}`, { method: "DELETE" });
    router.push("/");
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Links" subtitle="Each link is a secret: anyone holding it gets that view." />
        <div className="space-y-3 p-5">
          <CopyLink label="Supplier portal" url={portal} hint={`Mobile upload page in ${LANG_LABEL[s.language]}. No login.`}>
            {s.phone && <a className={`${btn.whatsapp} mt-3`} href={whatsappInvite(s.language, s.phone, v.settings.exporterName, portal)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" aria-hidden /> Send on WhatsApp</a>}
          </CopyLink>
          <CopyLink label="Verifier workspace" url={`${origin}/verify/${s.verifierToken}`} hint="Read-only evidence pack with per-value queries and sign-off." />
          <CopyLink label="Carbon Passport" url={`${origin}/passport/${s.passportToken}`} hint="Public summary the supplier can reuse with every buyer. Live after submission." />
        </div>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Exports" />
          <div className="flex flex-wrap gap-2 p-5">
            <a className={btn.secondary} href={`/api/suppliers/${s.id}/export`}><FileSpreadsheet className="h-4 w-4" aria-hidden /> CBAM data workbook (.xlsx)</a>
            <a className={btn.secondary} href={`/api/suppliers/${s.id}/export?format=json`}><Download className="h-4 w-4" aria-hidden /> Passport (.json)</a>
          </div>
          <p className="px-5 pb-5 text-xs text-slate-500">The workbook follows the sections of the EU communication template (installation, goods & SEE, precursors, activity data with document hashes). Copy it into the Commission&apos;s current template before filing.</p>
        </Card>
        <Card>
          <CardHeader title="Verifier comments" />
          {s.comments.length ? (
            <ul className="divide-y divide-slate-100 text-sm">{s.comments.map((c, i) => <li key={i} className="px-5 py-3"><span className="font-medium">{c.author}</span> <span className="text-xs text-slate-400">{timeAgo(c.at)} · {c.status}{c.rowId ? ` · row ${c.rowId}` : ""}</span><p className="text-slate-700">{c.text}</p></li>)}</ul>
          ) : <p className="px-5 py-4 text-sm text-slate-500">None yet.</p>}
        </Card>
        <Card>
          <CardHeader title="Recent activity" subtitle="From the hash-chained audit trail" />
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-xs">{audit.slice(0, 40).map((e) => <li key={e.seq} className="px-5 py-2"><span className="text-slate-400">#{e.seq} {timeAgo(e.at)}</span> <span className="font-medium text-slate-700">{e.action}</span> <span className="text-slate-500">{e.detail}</span></li>)}</ul>
        </Card>
        <button className={`${btn.ghost} text-rose-700`} onClick={remove}><Trash2 className="h-4 w-4" aria-hidden /> Delete supplier</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  const [v, setV] = useState<View | null>(null);
  const [missing, setMissing] = useState(false);
  // Server render shows a skeleton until data loads, so reading the URL here can't cause a hydration mismatch.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "overview";
    const t = new URLSearchParams(window.location.search).get("tab");
    return TABS.some((x) => x.key === t) ? (t as Tab) : "overview";
  });

  const load = useCallback(() => {
    fetch(`/api/suppliers/${id}`).then(async (r) => (r.ok ? setV(await r.json()) : setMissing(true)));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  const go = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", `?tab=${t}`);
  };

  if (missing) return <p className="text-sm text-slate-600">Supplier not found. <Link className="underline" href="/">Back</Link></p>;
  if (!v) return <div className="space-y-4"><Skeleton className="h-10 w-80" /><Skeleton className="h-64" /></div>;
  const s = v.supplier;
  const blocking = v.result.flags.filter((f) => f.severity === "critical" || f.severity === "major").length;

  return (
    <div className="rise space-y-6">
      <div>
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" aria-hidden /> Suppliers</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[24px] font-semibold tracking-tight">{s.name}</h1>
          <StatusPill status={s.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">{s.city}{s.state ? `, ${s.state}` : ""} · {s.contactName} {s.phone} · {LANG_LABEL[s.language]}</p>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => go(t.key)} className={cx("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition", tab === t.key ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {t.label}
            {t.key === "flags" && blocking > 0 && <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 text-[11px] font-semibold text-rose-700">{blocking}</span>}
            {t.key === "data" && <span className="ml-1.5 text-[11px] text-slate-400">{s.activity.length}</span>}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview v={v} />}
      {tab === "data" && <DataTab v={v} reload={load} setView={setV} />}
      {tab === "flags" && <FlagsTab v={v} go={go} />}
      {tab === "products" && <ProductsTab v={v} setView={setV} />}
      {tab === "share" && <ShareTab v={v} />}
    </div>
  );
}
