"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CircleCheck, FileText, FlaskConical, LoaderCircle, TriangleAlert, Upload, X } from "lucide-react";
import { Card, CardHeader, DOC_ICON, btn, cx } from "@/components/ui";
import { guessDocType } from "@/lib/format";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/types";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.txt";
const EXPECTED: { type: DocType; required: boolean }[] = [
  { type: "commercial_invoice", required: true },
  { type: "packing_list", required: true },
  { type: "bill_of_lading", required: false },
  { type: "certificate_of_origin", required: false },
  { type: "letter_of_credit", required: false },
  { type: "shipping_bill", required: false },
];
const STEPS = ["Reading documents", "Extracting fields", "Cross-checking the set", "Scoring risk"];

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Progress({ count }: { count: number }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="rise w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <LoaderCircle className="h-5 w-5 animate-spin text-teal-700" aria-hidden />
          <div>
            <div className="text-[15px] font-semibold">Checking {count} document{count === 1 ? "" : "s"}</div>
            <div className="text-xs text-slate-500">Scans can take up to a minute in AI mode.</div>
          </div>
        </div>
        <ol className="mt-5 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span className={cx("grid h-5 w-5 place-items-center rounded-full", i < step ? "bg-teal-600 text-white" : i === step ? "ring-2 ring-teal-600" : "ring-1 ring-slate-300")}>
                {i < step && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
                {i === step && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-600" />}
              </span>
              <span className={i <= step ? "text-slate-900" : "text-slate-400"}>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function NewCheck() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<{ count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const detected = new Set(files.map((f) => guessDocType(f.name)).filter(Boolean) as DocType[]);

  async function submit(form: FormData, count: number) {
    setBusy({ count });
    setError(null);
    try {
      const res = await fetch("/api/checks", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Check failed");
      router.push(`/checks/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed");
      setBusy(null);
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...Array.from(list).filter((f) => !seen.has(f.name + f.size))];
    });
  }

  function runUpload() {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    form.set("name", name);
    submit(form, files.length);
  }

  function runSample(sample: "clean" | "discrepant") {
    const form = new FormData();
    form.set("sample", sample);
    submit(form, 5);
  }

  return (
    <div className="rise space-y-8">
      {busy && <Progress count={busy.count} />}

      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">New check</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-slate-500">Add every document for one shipment. TradeCheck reads each one, cross-checks the whole set and tells you what to fix before filing.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <div className="space-y-5 p-6">
            <label className="block">
              <span className="text-[13px] font-medium text-slate-700">Shipment reference</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. SKW/EXP/0418 · Northfield UK"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:ring-4 focus:ring-teal-100"
              />
            </label>

            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={cx(
                "group relative cursor-pointer rounded-2xl border-2 border-dashed px-6 py-12 text-center outline-none transition focus-visible:ring-4 focus-visible:ring-teal-100",
                dragging ? "border-teal-500 bg-teal-50/70" : "border-slate-200 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] hover:border-teal-400",
              )}
            >
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition group-hover:-translate-y-0.5 group-hover:ring-teal-300">
                <Upload className="h-5 w-5 text-teal-700" aria-hidden />
              </div>
              <p className="mt-4 text-[15px] font-semibold text-slate-900">Drop documents here, or <span className="text-teal-700 underline decoration-teal-300 underline-offset-4">browse</span></p>
              <p className="mt-1 text-[13px] text-slate-500">PDF, scans and photos (PNG, JPG, WEBP) or text · up to 15 files, 20 MB each</p>
              <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </div>

            {files.length > 0 && (
              <ul className="space-y-2">
                {files.map((f) => {
                  const t = guessDocType(f.name);
                  const Icon = t ? DOC_ICON[t] : FileText;
                  return (
                    <li key={f.name + f.size} className="rise flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200"><Icon className="h-4 w-4 text-slate-600" aria-hidden /></span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{f.name}</div>
                        <div className="text-xs text-slate-500">{t ? DOC_TYPE_LABELS[t] : "Type detected on upload"} · {kb(f.size)}</div>
                      </div>
                      <button onClick={() => setFiles((p) => p.filter((x) => x !== f))} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Remove ${f.name}`}>
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-100">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-4 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            <span className="text-[13px] text-slate-500">{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} ready` : "No files added yet"}</span>
            <button disabled={!files.length || !!busy} onClick={runUpload} className={btn.primary}>
              Run check <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Document set" subtitle="Invoice and packing list are the minimum. Each extra document unlocks more checks." />
            <ul className="space-y-0.5 p-3">
              {EXPECTED.map(({ type, required }) => {
                const Icon = DOC_ICON[type];
                const has = detected.has(type);
                return (
                  <li key={type} className="flex items-center gap-3 rounded-lg px-3 py-2">
                    <Icon className={cx("h-4 w-4", has ? "text-teal-700" : "text-slate-400")} aria-hidden />
                    <span className={cx("flex-1 text-sm", has ? "font-medium text-slate-900" : "text-slate-600")}>{DOC_TYPE_LABELS[type]}</span>
                    {has ? (
                      <CircleCheck className="h-4 w-4 text-teal-600" aria-label="Added" />
                    ) : (
                      <span className="text-[11px] text-slate-400">{required ? "Required" : "Optional"}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Try a sample shipment" subtitle="Tirupur knitwear exporter → UK buyer, under an L/C." />
            <div className="space-y-2.5 p-4">
              <button disabled={!!busy} onClick={() => runSample("discrepant")} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-red-200 hover:bg-red-50/40 disabled:opacity-50">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-600"><FlaskConical className="h-4 w-4" aria-hidden /></span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">Shipment with errors</span>
                  <span className="block text-xs text-slate-500">9 planted mistakes that cause holds &amp; L/C rejections</span>
                </span>
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" aria-hidden />
              </button>
              <button disabled={!!busy} onClick={() => runSample("clean")} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40 disabled:opacity-50">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><CircleCheck className="h-4 w-4" aria-hidden /></span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">Clean shipment</span>
                  <span className="block text-xs text-slate-500">A consistent set that should pass</span>
                </span>
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" aria-hidden />
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
