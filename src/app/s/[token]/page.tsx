"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, CheckCircle2, Circle, FileUp, Leaf, Loader2, Pencil, Send } from "lucide-react";
import { cx } from "@/components/ui";
import { fmt } from "@/lib/format";
import { LANG_LABEL, t } from "@/lib/i18n";
import { LANGS, UNITS, type ActivityRow, type Lang, type SupplierStatus } from "@/lib/types";

type Portal = {
  buyer: string;
  supplier: {
    name: string;
    city: string;
    language: Lang;
    status: SupplierStatus;
    products: { id: string; name: string; cnCode: string }[];
    evidence: { id: string; fileName: string; docType: string; uploadedAt: string; periodStart: string | null; periodEnd: string | null }[];
    activity: ActivityRow[];
    passportToken: string | null;
  };
  result: { months: number; periodStart: string | null; periodEnd: string | null; score: { completeness: number } };
};

const STEPS = [
  { key: "elec", docs: ["electricity_bill"] },
  { key: "fuel", docs: ["fuel_invoice"] },
  { key: "prod", docs: ["production_register", "weighbridge_slip"] },
  { key: "purchase", docs: ["purchase_invoice", "weighbridge_slip"] },
] as const;

const KIND_ICON: Record<ActivityRow["kind"], string> = { electricity: "⚡", renewable_electricity: "☀️", fuel: "⛽", process_input: "🔩", production: "🏭", precursor: "📦" };

function RowCheck({ row, lang, onSave }: { row: ActivityRow; lang: Lang; onSave: (p: Partial<ActivityRow>) => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [q, setQ] = useState(String(row.quantity));
  const [u, setU] = useState(row.unit);
  const [busy, setBusy] = useState(false);
  const save = async (p: Partial<ActivityRow>) => {
    setBusy(true);
    await onSave(p);
    setBusy(false);
    setEdit(false);
  };
  return (
    <li className={cx("rounded-2xl border bg-white p-4", row.lowConfidence ? "border-amber-300" : "border-slate-200")}>
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>{KIND_ICON[row.kind]}</span>
        <div className="min-w-0 flex-1">
          {edit ? (
            <div className="flex gap-2">
              <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-lg" inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Quantity" />
              <select className="rounded-xl border border-slate-300 px-2 text-base" value={u} onChange={(e) => setU(e.target.value as ActivityRow["unit"])} aria-label="Unit">{UNITS.map((x) => <option key={x}>{x}</option>)}</select>
            </div>
          ) : (
            <div className="num text-xl font-semibold text-slate-900">{fmt(row.quantity, row.quantity % 1 ? 2 : 0)} <span className="text-base font-normal text-slate-500">{row.unit}</span></div>
          )}
          <div className="mt-0.5 text-sm text-slate-600">{row.material ?? row.fuel ?? row.kind.replace("_", " ")} · {row.periodStart}{row.periodEnd && row.periodEnd !== row.periodStart ? ` → ${row.periodEnd}` : ""}</div>
          {row.sourceQuote && <div className="mt-1 truncate rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-500">“{row.sourceQuote}”</div>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {edit ? (
          <button disabled={busy} className="col-span-2 rounded-xl bg-emerald-700 py-3 text-base font-semibold text-white" onClick={() => save({ quantity: Number(q.replace(/,/g, "")), unit: u, confirmed: true })}>{t(lang, "save")}</button>
        ) : (
          <>
            <button disabled={busy} className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 py-3 text-base font-semibold text-white" onClick={() => save({ confirmed: true })}><Check className="h-5 w-5" aria-hidden /> {t(lang, "confirm")}</button>
            <button className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 py-3 text-base font-medium text-slate-700" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" aria-hidden /> {t(lang, "edit")}</button>
          </>
        )}
      </div>
    </li>
  );
}

export default function SupplierPortal() {
  const { token } = useParams<{ token: string }>();
  const [p, setP] = useState<Portal | null>(null);
  const [missing, setMissing] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cam = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/portal/${token}`);
    if (!r.ok) return setMissing(true);
    const d: Portal = await r.json();
    setP(d);
    return d;
  }, [token]);
  useEffect(() => {
    load().then((d) => {
      let saved: string | null = null;
      try { saved = localStorage.getItem("cl-lang"); } catch {}
      setLang((saved as Lang) && LANGS.includes(saved as Lang) ? (saved as Lang) : d?.supplier.language ?? "en");
    });
  }, [load]);
  const pickLang = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem("cl-lang", l); } catch {}
  };

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    const r = await fetch(`/api/portal/${token}`, { method: "POST", body: fd });
    const b = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(b.error);
    const errs = b.results.filter((x: { error?: string }) => x.error);
    if (errs.length) setMsg(errs.map((x: { name: string; error: string }) => `${x.name}: ${x.error}`).join("\n"));
    setP(b.view);
    if (cam.current) cam.current.value = "";
    if (file.current) file.current.value = "";
  }
  async function patch(rowId: string, patch: Partial<ActivityRow>) {
    const r = await fetch(`/api/portal/${token}/rows`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rowId, ...patch }) });
    const b = await r.json();
    if (!r.ok) return setMsg(b.error);
    setP(b);
  }
  async function submit() {
    const r = await fetch(`/api/portal/${token}/submit`, { method: "POST" });
    const b = await r.json();
    if (!r.ok) return setMsg(b.error);
    setP(b);
  }

  if (missing) return <div className="grid min-h-screen place-items-center p-6 text-center text-slate-600">This link is not valid. Ask your buyer for a new one.</div>;
  if (!p) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-700" aria-hidden /></div>;

  const s = p.supplier;
  const docTypes = new Set(s.evidence.map((e) => e.docType));
  const pending = s.activity.filter((r) => !r.confirmed);
  const done = s.status === "submitted" || s.status === "verified";

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[#f4f6f5] pb-28">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[#0a1512] px-4 py-3 text-white">
        <span className="flex items-center gap-2 text-sm font-semibold"><Leaf className="h-4 w-4 text-emerald-400" aria-hidden /> CarbonLink</span>
        <select value={lang} onChange={(e) => pickLang(e.target.value as Lang)} className="rounded-lg bg-white/10 px-2 py-1 text-sm text-white" aria-label="Language">
          {LANGS.map((l) => <option key={l} value={l} className="text-slate-900">{LANG_LABEL[l]}</option>)}
        </select>
      </header>

      <div className="space-y-5 px-4 pt-5">
        <div>
          <p className="text-sm font-medium text-emerald-800">{s.name}</p>
          <h1 className="mt-1 text-[22px] font-semibold leading-snug text-slate-900">{t(lang, "title")}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{t(lang, "intro", { buyer: p.buyer })}</p>
        </div>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-800">{t(lang, "progress")}</div>
          <ul className="mt-3 space-y-2.5">
            {STEPS.map((st) => {
              const ok = st.docs.some((d) => docTypes.has(d));
              return (
                <li key={st.key} className="flex items-start gap-2.5 text-[15px]">
                  {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" aria-hidden />}
                  <span className={ok ? "text-slate-800" : "text-slate-600"}>{t(lang, st.key)} <span className="text-xs text-slate-400">· {ok ? t(lang, "done") : t(lang, "missing")}</span></span>
                </li>
              );
            })}
          </ul>
          {p.result.months > 0 && <p className="mt-3 text-sm text-slate-500">{t(lang, "months")}: <span className="font-medium text-slate-800">{p.result.months}</span> ({p.result.periodStart} → {p.result.periodEnd})</p>}
        </section>

        {!done && (
          <section className="grid grid-cols-2 gap-3">
            <button disabled={busy} onClick={() => cam.current?.click()} className="flex flex-col items-center gap-1.5 rounded-2xl bg-emerald-700 px-3 py-5 text-base font-semibold text-white shadow-sm disabled:opacity-60">
              {busy ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden /> : <Camera className="h-7 w-7" aria-hidden />}
              {busy ? t(lang, "reading") : t(lang, "photo")}
            </button>
            <button disabled={busy} onClick={() => file.current?.click()} className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-3 py-5 text-base font-medium text-slate-700 disabled:opacity-60">
              <FileUp className="h-7 w-7" aria-hidden /> {t(lang, "file")}
            </button>
            <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => upload(e.target.files)} />
            <input ref={file} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" className="sr-only" onChange={(e) => upload(e.target.files)} />
          </section>
        )}
        {msg && <p className="whitespace-pre-line rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{msg}</p>}

        {pending.length > 0 && !done && (
          <section>
            <h2 className="text-base font-semibold text-slate-800">{t(lang, "check")} ({pending.length})</h2>
            <ul className="mt-3 space-y-3">{pending.map((r) => <RowCheck key={r.id} row={r} lang={lang} onSave={(x) => patch(r.id, x)} />)}</ul>
          </section>
        )}

        {s.evidence.length > 0 && (
          <section className="rounded-2xl bg-white p-4 text-sm shadow-sm">
            <div className="font-semibold text-slate-800">{t(lang, "done")} ({s.evidence.length})</div>
            <ul className="mt-2 space-y-1 text-slate-600">{s.evidence.map((e) => <li key={e.id} className="truncate">✓ {e.fileName}</li>)}</ul>
          </section>
        )}

        {done ? (
          <section className="rounded-2xl bg-emerald-50 p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
            <p className="mt-2 text-lg font-semibold text-emerald-900">{t(lang, "submitted")}</p>
            <p className="mt-1 text-sm text-emerald-900/80">{t(lang, "passport")}</p>
            {s.passportToken && <a href={`/passport/${s.passportToken}`} className="mt-3 inline-block rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Carbon Passport →</a>}
          </section>
        ) : (
          <p className="text-center text-sm text-slate-500">{t(lang, "passport")}</p>
        )}
        <p className="text-center text-xs text-slate-400">{t(lang, "privacy", { buyer: p.buyer })}</p>
      </div>

      {!done && s.evidence.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
          <button onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-base font-semibold text-white"><Send className="h-5 w-5" aria-hidden /> {t(lang, "submit")}</button>
        </div>
      )}
    </div>
  );
}
