"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, Field, Skeleton, btn, input } from "@/components/ui";
import { FUEL_FACTORS, ILLUSTRATIVE_BENCHMARK, ILLUSTRATIVE_DEFAULTS, SECTOR_LABEL, cnGroup } from "@/lib/factors";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [overrides, setOverrides] = useState<{ cn: string; direct: number; indirect: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d: Settings) => {
      setS(d);
      setOverrides(Object.entries(d.defaultOverrides).map(([cn, v]) => ({ cn, ...v })));
    });
  }, []);

  async function save() {
    if (!s) return;
    setSaving(true);
    const defaultOverrides = Object.fromEntries(overrides.filter((o) => o.cn.trim()).map((o) => [o.cn, { direct: o.direct, indirect: o.indirect }]));
    const res = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...s, defaultOverrides }) });
    setS(await res.json());
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!s) return <Skeleton className="h-96" />;
  const num = (k: keyof Settings) => ({ type: "number", step: "any", min: 0, value: s[k] as number, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) }) });

  return (
    <div className="rise space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Settings & factors</h1>
          <p className="mt-1 max-w-3xl text-[15px] text-slate-500">Every factor the engine uses. Have your CBAM advisor sign these off before a pilot; changes are logged in the audit trail.</p>
        </div>
        <button className={btn.primary} onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{saved ? "Saved" : "Save settings"}</button>
      </div>

      <Card>
        <CardHeader title="Workspace & prices" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
          <Field label="Exporter name (shown to suppliers)"><input className={input} value={s.exporterName} onChange={(e) => setS({ ...s, exporterName: e.target.value })} /></Field>
          <Field label="Reporting year"><input className={input} {...num("reportingYear")} /></Field>
          <Field label="CBAM certificate price (€/tCO₂)" hint="EU ETS auction average; quarterly in 2026, weekly from 2027"><input className={input} {...num("etsPriceEur")} /></Field>
          <Field label="EUR → INR"><input className={input} {...num("eurInr")} /></Field>
          <Field label="Grid emission factor (tCO₂/MWh)" hint="CEA CO₂ Baseline Database, weighted average. Confirm the latest version."><input className={input} {...num("gridEf")} /></Field>
          <Field label="Carbon price paid in India (€/t)" hint="Deductible from CBAM. 0 until CCTS has a price."><input className={input} {...num("originCarbonPriceEur")} /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="EU default value overrides" subtitle="The built-in defaults are ILLUSTRATIVE. Enter the official EU default values for India here (longest CN prefix wins)." action={<button className={btn.secondary} onClick={() => setOverrides([...overrides, { cn: "", direct: 0, indirect: 0 }])}><Plus className="h-4 w-4" aria-hidden /> Add</button>} />
        <div className="space-y-2 p-5 sm:p-6">
          {!overrides.length && <p className="text-sm text-slate-500">No overrides yet: the illustrative values below are in use.</p>}
          {overrides.map((o, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Field label="CN prefix"><input className={`${input} font-mono`} value={o.cn} onChange={(e) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, cn: e.target.value.replace(/\D/g, "") } : x)))} placeholder="731815" /></Field>
              <Field label="Direct (tCO₂e/t)"><input className={input} type="number" step="any" value={o.direct} onChange={(e) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, direct: Number(e.target.value) } : x)))} /></Field>
              <Field label="Indirect (tCO₂e/t)"><input className={input} type="number" step="any" value={o.indirect} onChange={(e) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, indirect: Number(e.target.value) } : x)))} /></Field>
              <button className={btn.ghost} onClick={() => setOverrides(overrides.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" aria-hidden /></button>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Built-in illustrative defaults" />
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2">CN</th><th className="px-4 py-2">Goods</th><th className="px-4 py-2 text-right">Direct</th><th className="px-4 py-2 text-right">Indirect</th></tr></thead>
              <tbody className="num divide-y divide-slate-100">{Object.entries(ILLUSTRATIVE_DEFAULTS).map(([cn, v]) => <tr key={cn}><td className="px-4 py-1.5 font-mono text-xs">{cn}</td><td className="px-4 py-1.5 text-xs text-slate-600">{cnGroup(cn)?.label}</td><td className="px-4 py-1.5 text-right">{v.direct}</td><td className="px-4 py-1.5 text-right">{v.indirect}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Fuel factors (IPCC 2006) & benchmarks" />
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2">Fuel</th><th className="px-4 py-2 text-right">NCV GJ/unit</th><th className="px-4 py-2 text-right">tCO₂/TJ</th></tr></thead>
            <tbody className="num divide-y divide-slate-100">{Object.values(FUEL_FACTORS).map((f) => <tr key={f.label}><td className="px-4 py-1.5 text-xs">{f.label}<div className="text-[10px] text-slate-400">{f.source}</div></td><td className="px-4 py-1.5 text-right">{f.ncvGJ.toFixed(4)} /{f.baseUnit}</td><td className="px-4 py-1.5 text-right">{f.efPerTJ}</td></tr>)}</tbody>
          </table>
          <div className="border-t border-slate-100 p-4 text-xs text-slate-600">
            <div className="font-medium text-slate-700">Illustrative CBAM benchmarks (tCO₂/t)</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{Object.entries(ILLUSTRATIVE_BENCHMARK).map(([k, v]) => <span key={k}>{SECTOR_LABEL[k as keyof typeof SECTOR_LABEL]}: {v}</span>)}</div>
            <p className="mt-2 text-slate-500">Benchmarks only shift absolute costs; the default-vs-actual saving does not depend on them. Edit in src/lib/factors.ts.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
