"use client";

import { Link2, Plus, Trash2 } from "lucide-react";
import { CN_GROUPS, ROUTES, ROUTE_PRECURSORS, cnGroup, defaultFor } from "@/lib/factors";
import type { Precursor, Product } from "@/lib/types";
import { btn, input } from "@/components/ui";

export type UpstreamOption = { supplierId: string; supplierName: string; productId: string; productName: string };

const rid = () => Math.random().toString(36).slice(2, 10);

export function precursorsForRoute(route: string): Precursor[] {
  return (ROUTE_PRECURSORS[route] ?? []).map((p) => {
    const d = p.zero ? { direct: 0, indirect: 0 } : defaultFor(p.cnCode);
    return { id: rid(), name: p.name, cnCode: p.cnCode, seeDirect: d?.direct ?? 0, seeIndirect: d?.indirect ?? 0, source: p.zero ? "actual" : "default" };
  });
}

export function newProduct(route = "steel_fasteners"): Product {
  return { id: "", name: "", cnCode: "", route, euTonnesPerYear: 0, precursors: precursorsForRoute(route) };
}

export function ProductEditor({ products, onChange, upstream }: { products: Product[]; onChange: (p: Product[]) => void; upstream: UpstreamOption[] }) {
  const set = (i: number, patch: Partial<Product>) => onChange(products.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setPc = (i: number, k: number, patch: Partial<Precursor>) => set(i, { precursors: products[i].precursors.map((pc, j) => (j === k ? { ...pc, ...patch } : pc)) });

  return (
    <div className="space-y-4">
      <datalist id="cn-codes">{CN_GROUPS.map((g) => <option key={g.prefix} value={g.prefix}>{g.label}</option>)}</datalist>
      {products.map((p, i) => {
        const grp = cnGroup(p.cnCode);
        return (
          <div key={p.id || i} className="rounded-xl border border-slate-200 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_1.4fr_0.7fr_auto]">
              <label className="text-xs font-medium text-slate-600">Product name
                <input className={`${input} mt-1`} value={p.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Hex bolts" />
              </label>
              <label className="text-xs font-medium text-slate-600">CN code
                <input className={`${input} mt-1 font-mono`} list="cn-codes" value={p.cnCode} onChange={(e) => set(i, { cnCode: e.target.value })} placeholder="7318 15 88" />
                <span className={`mt-1 block text-[11px] ${grp ? "text-slate-500" : "text-rose-600"}`}>{p.cnCode ? (grp ? grp.label : "Not a CBAM good we know") : " "}</span>
              </label>
              <label className="text-xs font-medium text-slate-600">Production route
                <select className={`${input} mt-1`} value={p.route} onChange={(e) => set(i, { route: e.target.value, precursors: p.precursors.length ? p.precursors : precursorsForRoute(e.target.value) })}>
                  {Object.entries(ROUTES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">EU tonnes / year
                <input className={`${input} mt-1`} type="number" min={0} value={p.euTonnesPerYear || ""} onChange={(e) => set(i, { euTonnesPerYear: Number(e.target.value) })} />
              </label>
              <button type="button" className={`${btn.ghost} self-start sm:mt-5`} onClick={() => onChange(products.filter((_, j) => j !== i))} aria-label="Remove product"><Trash2 className="h-4 w-4" aria-hidden /></button>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Purchased precursors</span>
                <button type="button" className={btn.ghost} onClick={() => set(i, { precursors: [...p.precursors, { id: rid(), name: "", cnCode: "", seeDirect: 0, seeIndirect: 0, source: "default" }] })}><Plus className="h-3.5 w-3.5" aria-hidden /> Add</button>
              </div>
              {!p.precursors.length && <p className="mt-1 text-xs text-slate-500">None: this product is made from raw materials on site (e.g. remelting scrap only).</p>}
              <div className="mt-2 space-y-2">
                {p.precursors.map((pc, k) => {
                  const options = upstream.filter((u) => u.supplierName);
                  return (
                    <div key={pc.id} className="grid items-end gap-2 rounded-lg bg-slate-50 p-2.5 sm:grid-cols-[1fr_0.7fr_1.3fr_0.6fr_0.6fr_auto]">
                      <label className="text-[11px] text-slate-500">Name<input className={`${input} mt-0.5 py-1.5`} value={pc.name} onChange={(e) => setPc(i, k, { name: e.target.value })} /></label>
                      <label className="text-[11px] text-slate-500">CN<input className={`${input} mt-0.5 py-1.5 font-mono`} value={pc.cnCode} onChange={(e) => {
                        const d = defaultFor(e.target.value);
                        setPc(i, k, { cnCode: e.target.value, ...(pc.source === "default" && d ? { seeDirect: d.direct, seeIndirect: d.indirect } : {}) });
                      }} /></label>
                      <label className="text-[11px] text-slate-500">Source of its emissions
                        <select className={`${input} mt-0.5 py-1.5`} value={pc.source === "passport" ? `p:${pc.linkedSupplierId}:${pc.linkedProductId}` : pc.source} onChange={(e) => {
                          const v = e.target.value;
                          if (v.startsWith("p:")) {
                            const [, sid, pid] = v.split(":");
                            setPc(i, k, { source: "passport", linkedSupplierId: sid, linkedProductId: pid });
                          } else {
                            const d = v === "default" ? defaultFor(pc.cnCode) : null;
                            setPc(i, k, { source: v as Precursor["source"], linkedSupplierId: undefined, linkedProductId: undefined, ...(d ? { seeDirect: d.direct, seeIndirect: d.indirect } : {}) });
                          }
                        }}>
                          <option value="default">EU default value</option>
                          <option value="actual">Actual (from producer&apos;s report)</option>
                          {options.length > 0 && <optgroup label="Link a CarbonLink passport">{options.map((u) => <option key={`${u.supplierId}:${u.productId}`} value={`p:${u.supplierId}:${u.productId}`}>{u.supplierName}: {u.productName}</option>)}</optgroup>}
                        </select>
                      </label>
                      <label className="text-[11px] text-slate-500">Direct t/t<input className={`${input} mt-0.5 py-1.5`} type="number" step="0.001" min={0} disabled={pc.source !== "actual"} value={pc.seeDirect} onChange={(e) => setPc(i, k, { seeDirect: Number(e.target.value) })} /></label>
                      <label className="text-[11px] text-slate-500">Indirect t/t<input className={`${input} mt-0.5 py-1.5`} type="number" step="0.001" min={0} disabled={pc.source !== "actual"} value={pc.seeIndirect} onChange={(e) => setPc(i, k, { seeIndirect: Number(e.target.value) })} /></label>
                      <button type="button" className={btn.ghost} onClick={() => set(i, { precursors: p.precursors.filter((_, j) => j !== k) })} aria-label="Remove precursor"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                      {pc.source === "passport" && <p className="col-span-full flex items-center gap-1 text-[11px] text-emerald-700"><Link2 className="h-3 w-3" aria-hidden /> Uses the upstream supplier&apos;s live calculated footprint (falls back to the default until they submit).</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
      <button type="button" className={btn.secondary} onClick={() => onChange([...products, newProduct()])}><Plus className="h-4 w-4" aria-hidden /> Add product</button>
    </div>
  );
}
