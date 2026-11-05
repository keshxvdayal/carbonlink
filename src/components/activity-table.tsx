"use client";

import { Check, FileText, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { FUEL_FACTORS } from "@/lib/factors";
import { fmt } from "@/lib/format";
import { ACTIVITY_KINDS, FUELS, UNITS, type ActivityRow, type Evidence, type Product } from "@/lib/types";
import { btn, cx, input } from "@/components/ui";

export const KIND_LABEL: Record<ActivityRow["kind"], string> = {
  electricity: "Grid electricity",
  renewable_electricity: "Renewable electricity",
  fuel: "Fuel",
  process_input: "Electrodes / carbon",
  production: "Production",
  precursor: "Precursor purchase",
};

export const DOC_LABEL: Record<Evidence["data"]["docType"], string> = {
  electricity_bill: "Electricity bill",
  fuel_invoice: "Fuel invoice",
  weighbridge_slip: "Weighbridge slip",
  production_register: "Production register",
  purchase_invoice: "Purchase invoice",
  other: "Other",
};

type Props = {
  rows: ActivityRow[];
  evidence: Evidence[];
  products: Product[];
  highlight?: Set<string>;
  onPatch: (rowIds: string[], patch: Partial<ActivityRow>) => Promise<void>;
  onDelete?: (rowId: string) => Promise<void>;
  evidenceHref: (e: Evidence) => string;
};

function RowEditor({ row, products, onSave, onCancel }: { row: ActivityRow; products: Product[]; onSave: (p: Partial<ActivityRow>) => void; onCancel: () => void }) {
  const [d, setD] = useState<Partial<ActivityRow>>({ kind: row.kind, fuel: row.fuel, productId: row.productId, quantity: row.quantity, unit: row.unit, periodStart: row.periodStart, periodEnd: row.periodEnd });
  return (
    <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3 lg:grid-cols-7">
      <select className={input} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as ActivityRow["kind"] })} aria-label="Kind">{ACTIVITY_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
      {d.kind === "fuel" ? (
        <select className={input} value={d.fuel ?? ""} onChange={(e) => setD({ ...d, fuel: (e.target.value || null) as ActivityRow["fuel"] })} aria-label="Fuel"><option value="">Fuel…</option>{FUELS.map((f) => <option key={f} value={f}>{FUEL_FACTORS[f].label}</option>)}</select>
      ) : d.kind === "production" || d.kind === "precursor" ? (
        <select className={input} value={d.productId ?? ""} onChange={(e) => setD({ ...d, productId: e.target.value || null })} aria-label="Product"><option value="">Product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      ) : <span />}
      <input className={input} type="number" step="any" min={0} value={d.quantity} onChange={(e) => setD({ ...d, quantity: Number(e.target.value) })} aria-label="Quantity" />
      <select className={input} value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value as ActivityRow["unit"] })} aria-label="Unit">{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
      <input className={input} type="date" value={d.periodStart ?? ""} onChange={(e) => setD({ ...d, periodStart: e.target.value || null })} aria-label="From" />
      <input className={input} type="date" value={d.periodEnd ?? ""} onChange={(e) => setD({ ...d, periodEnd: e.target.value || null })} aria-label="To" />
      <div className="flex gap-1">
        <button className={btn.primary + " px-3 py-2"} onClick={() => onSave(d)}><Check className="h-4 w-4" aria-hidden /> Save</button>
        <button className={btn.ghost} onClick={onCancel} aria-label="Cancel"><X className="h-4 w-4" aria-hidden /></button>
      </div>
    </div>
  );
}

export function ActivityTable({ rows, evidence, products, highlight, onPatch, onDelete, evidenceHref }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const byEv = new Map(evidence.map((e) => [e.id, e]));
  const productName = (id: string | null) => products.find((p) => p.id === id)?.name;

  if (!rows.length) return <p className="px-6 py-10 text-center text-sm text-slate-500">No values yet. Upload bills, invoices or registers above.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 font-semibold">Value</th>
            <th className="px-4 py-2 text-right font-semibold">Quantity</th>
            <th className="px-4 py-2 font-semibold">Period</th>
            <th className="px-4 py-2 font-semibold">Source</th>
            <th className="px-4 py-2 font-semibold">Status</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const ev = r.evidenceId ? byEv.get(r.evidenceId) : undefined;
            if (editing === r.id)
              return (
                <tr key={r.id}><td colSpan={6} className="p-2"><RowEditor row={r} products={products} onCancel={() => setEditing(null)} onSave={async (p) => { await onPatch([r.id], p); setEditing(null); }} /></td></tr>
              );
            return (
              <tr key={r.id} id={`row-${r.id}`} className={cx("align-top", highlight?.has(r.id) && "bg-amber-50/60")}>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-800">{KIND_LABEL[r.kind]}{r.fuel ? `: ${FUEL_FACTORS[r.fuel].label}` : ""}</div>
                  <div className="text-xs text-slate-500">
                    {r.material && <span>{r.material}</span>}
                    {(r.kind === "production" || r.kind === "precursor") && <span className={cx("ml-1", !r.productId && "font-medium text-rose-600")}>→ {productName(r.productId) ?? "not linked to a product"}</span>}
                  </div>
                </td>
                <td className="num px-4 py-2.5 text-right font-medium text-slate-900">{fmt(r.quantity, r.quantity % 1 ? 2 : 0)} <span className="text-xs font-normal text-slate-500">{r.unit}</span></td>
                <td className="px-4 py-2.5 text-xs text-slate-600">{r.periodStart ?? "?"}{r.periodEnd && r.periodEnd !== r.periodStart ? ` → ${r.periodEnd}` : ""}</td>
                <td className="max-w-[260px] px-4 py-2.5 text-xs">
                  {ev ? (
                    <a href={evidenceHref(ev)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-emerald-800 hover:underline"><FileText className="h-3.5 w-3.5" aria-hidden />{ev.fileName}</a>
                  ) : <span className="font-medium text-rose-600">No document</span>}
                  {r.sourceQuote && <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500" title={r.sourceQuote}>“{r.sourceQuote}”</div>}
                </td>
                <td className="px-4 py-2.5">
                  {r.confirmed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" aria-hidden /> Confirmed</span>
                  ) : (
                    <button className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50" onClick={() => onPatch([r.id], { confirmed: true })}>
                      {r.lowConfidence ? "⚠ Check & confirm" : "Confirm"}
                    </button>
                  )}
                  <div className="mt-0.5 text-[11px] text-slate-400">read by {r.origin === "ai" ? "AI" : r.origin}</div>
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <button className={btn.ghost} onClick={() => setEditing(r.id)} aria-label="Edit"><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
                  {onDelete && <button className={btn.ghost} onClick={() => confirm("Delete this value?") && onDelete(r.id)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
