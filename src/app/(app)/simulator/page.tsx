"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, IndianRupee, TrendingDown } from "lucide-react";
import { Card, CardHeader, Field, Skeleton, StatTile, btn, input } from "@/components/ui";
import { SECTOR_LABEL } from "@/lib/factors";
import { eur, fmt, inr } from "@/lib/format";
import { SIM_YEARS, simulateYear, type SimYear } from "@/lib/simulator";
import { SECTORS, type Sector, type Settings } from "@/lib/types";

type Item = { key: string; supplierId: string; productId: string; label: string; sector: Sector; seeActual: number; seeDefault: number; tonnes: number };
type Line = { sector: Sector; tonnes: number; seeActual: number; seeDefault: number };

const PORTFOLIO = "__all";
const MANUAL = "__manual";

/* Grouped bars, one axis (€), hover tooltip, legend; the table below is the table view. */
function CostChart({ years }: { years: { year: number; costDefaultEur: number; costActualEur: number; savingEur: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 260, padL = 64, padB = 28, padT = 12;
  const raw = Math.max(1, ...years.map((y) => y.costDefaultEur));
  // Round the axis to a 1/2/2.5/5 × 10^n step so tick labels are readable.
  const mag = 10 ** Math.floor(Math.log10(raw / 4));
  const tickStep = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st * 4 >= raw) ?? 10 * mag;
  const max = tickStep * 4;
  const step = (W - padL) / years.length;
  const bw = Math.min(22, step / 3);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, 1, 2, 3, 4].map((k) => k * tickStep);
  const bar = (x: number, v: number, color: string) => {
    const top = y(v), base = y(0), h = Math.max(0, base - top);
    if (h < 0.5) return null;
    const r = Math.min(4, h, bw / 2);
    return <path d={`M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z`} fill={color} />;
  };
  const hv = hover !== null ? years[hover] : null;
  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--series-default)" }} /> Cost on EU default values (with mark-up)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--series-actual)" }} /> Cost on actual supplier data</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="CBAM certificate cost per year, default values versus actual data">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">{t >= 1e6 ? `€${+(t / 1e6).toFixed(2)}M` : t >= 1e3 ? `€${+(t / 1e3).toFixed(1)}k` : `€${Math.round(t)}`}</text>
          </g>
        ))}
        {years.map((yr, i) => {
          const cx = padL + step * i + step / 2;
          return (
            <g key={yr.year}>
              {hover === i && <rect x={padL + step * i + 2} y={padT} width={step - 4} height={H - padT - padB} fill="#f1f5f9" rx={6} />}
              {bar(cx - bw - 1, yr.costDefaultEur, "var(--series-default)")}
              {bar(cx + 1, yr.costActualEur, "var(--series-actual)")}
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">{yr.year}</text>
              <rect x={padL + step * i} y={0} width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {hv && hover !== null && (
        <div className="pointer-events-none absolute top-8 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg" style={{ left: `min(calc(${((padL + step * hover + step) / W) * 100}% + 8px), calc(100% - 200px))` }}>
          <div className="font-semibold text-slate-900">{hv.year}</div>
          <div className="num mt-1 flex justify-between gap-6 text-slate-600"><span>Default values</span><span className="text-slate-900">{eur(hv.costDefaultEur)}</span></div>
          <div className="num flex justify-between gap-6 text-slate-600"><span>Actual data</span><span className="text-slate-900">{eur(hv.costActualEur)}</span></div>
          <div className="num mt-1 flex justify-between gap-6 border-t border-slate-100 pt-1 font-medium text-slate-900"><span>Saved</span><span>{eur(hv.savingEur)}</span></div>
        </div>
      )}
    </div>
  );
}

export default function Simulator() {
  const [data, setData] = useState<{ settings: Settings; products: Item[] } | null>(null);
  const [sel, setSel] = useState<string>(PORTFOLIO);
  const [manual, setManual] = useState<Line>({ sector: "iron_steel", tonnes: 1000, seeActual: 1.5, seeDefault: 3.1 });
  const [price, setPrice] = useState(75);
  const [fx, setFx] = useState(100);
  const [origin, setOrigin] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/simulator").then((r) => r.json()).then((d) => {
      setData(d);
      setPrice(d.settings.etsPriceEur);
      setFx(d.settings.eurInr);
      setOrigin(d.settings.originCarbonPriceEur);
      const q = new URLSearchParams(window.location.search);
      const key = `${q.get("supplier")}:${q.get("product")}`;
      if (d.products.some((p: Item) => p.key === key)) setSel(key);
      else if (!d.products.length) setSel(MANUAL);
    });
  }, []);

  const lines: Line[] = useMemo(() => {
    if (!data) return [];
    if (sel === MANUAL) return [manual];
    if (sel === PORTFOLIO) return data.products;
    const p = data.products.find((x) => x.key === sel);
    return p ? [p] : [];
  }, [data, sel, manual]);

  const years = useMemo(
    () =>
      SIM_YEARS.map((year) => {
        const per = lines.map((l) => simulateYear({ ...l, etsPriceEur: price, originCarbonPriceEur: origin }, year));
        const sum = (k: keyof SimYear) => per.reduce((a, r) => a + (r[k] as number), 0);
        return { year, costDefaultEur: sum("costDefaultEur"), costActualEur: sum("costActualEur"), savingEur: sum("savingEur"), markup: per[0]?.markup ?? 0, freeShare: per[0]?.freeShare ?? 0 };
      }),
    [lines, price, origin],
  );
  const year1 = years.find((y) => y.year === (data?.settings.reportingYear ?? 2026)) ?? years[0];
  const total = years.reduce((a, y) => a + y.savingEur, 0);
  const tonnes = lines.reduce((a, l) => a + l.tonnes, 0);
  const pitch = `On ${fmt(tonnes, 0)} t/year of CBAM goods, proving actual supplier emissions instead of EU defaults saves about ${inr(year1.savingEur * fx)} in ${year1.year} and ${inr(total * fx)} through 2034, at €${price}/t CO₂. (Estimate; benchmarks and defaults to be confirmed.)`;

  if (!data) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-80" /></div>;

  return (
    <div className="rise space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Default vs actual: what it costs</h1>
        <p className="mt-1 max-w-3xl text-[15px] text-slate-500">Without actual data, EU importers must use default values plus a mark-up (10% in 2026, 20% in 2027, 30% from 2028). The free-allocation deduction is the same either way, so every tonne you prove you didn&apos;t emit is saved at the full certificate price.</p>
      </div>

      <Card>
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          <Field label="Scenario">
            <select className={input} value={sel} onChange={(e) => setSel(e.target.value)}>
              {data.products.length > 0 && <option value={PORTFOLIO}>All supplier products ({data.products.length})</option>}
              {data.products.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              <option value={MANUAL}>Manual (prospect pitch)</option>
            </select>
          </Field>
          <Field label="CBAM certificate price (€/tCO₂)"><input className={input} type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} /></Field>
          <Field label="EUR → INR"><input className={input} type="number" min={0} value={fx} onChange={(e) => setFx(Number(e.target.value))} /></Field>
          <Field label="Carbon price paid in India (€/t)" hint="Deductible. 0 until CCTS has a price."><input className={input} type="number" min={0} value={origin} onChange={(e) => setOrigin(Number(e.target.value))} /></Field>
          {sel === MANUAL && (
            <>
              <Field label="Sector"><select className={input} value={manual.sector} onChange={(e) => setManual({ ...manual, sector: e.target.value as Sector })}>{SECTORS.map((s) => <option key={s} value={s}>{SECTOR_LABEL[s]}</option>)}</select></Field>
              <Field label="Tonnes exported to EU / year"><input className={input} type="number" min={0} value={manual.tonnes} onChange={(e) => setManual({ ...manual, tonnes: Number(e.target.value) })} /></Field>
              <Field label="Actual SEE (tCO₂e/t)"><input className={input} type="number" step="0.01" min={0} value={manual.seeActual} onChange={(e) => setManual({ ...manual, seeActual: Number(e.target.value) })} /></Field>
              <Field label="EU default SEE (tCO₂e/t)"><input className={input} type="number" step="0.01" min={0} value={manual.seeDefault} onChange={(e) => setManual({ ...manual, seeDefault: Number(e.target.value) })} /></Field>
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label={`Saved in ${year1.year}`} value={inr(year1.savingEur * fx)} hint={`${eur(year1.savingEur)} on ${fmt(tonnes, 0)} t/year`} Icon={IndianRupee} />
        <StatTile label="Saved 2026–2034" value={inr(total * fx)} hint={eur(total)} Icon={TrendingDown} />
        <StatTile label="Saved in 2030" value={inr((years.find((y) => y.year === 2030)?.savingEur ?? 0) * fx)} hint="Free allocation is halved by then: the gap widens" Icon={TrendingDown} />
      </div>

      <Card>
        <CardHeader title="CBAM certificate cost per year" subtitle="Same tonnes every year; certificate price held constant" />
        <div className="p-5 sm:p-6"><CostChart years={years} /></div>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2">Year</th><th className="px-4 py-2 text-right">Default mark-up</th><th className="px-4 py-2 text-right">Free allocation still given</th><th className="px-4 py-2 text-right">Cost on defaults</th><th className="px-4 py-2 text-right">Cost on actuals</th><th className="px-4 py-2 text-right">Saved</th></tr>
            </thead>
            <tbody className="num divide-y divide-slate-100">
              {years.map((y) => (
                <tr key={y.year}><td className="px-4 py-2">{y.year}</td><td className="px-4 py-2 text-right">{Math.round(y.markup * 100)}%</td><td className="px-4 py-2 text-right">{(y.freeShare * 100).toFixed(1)}%</td><td className="px-4 py-2 text-right">{eur(y.costDefaultEur)}</td><td className="px-4 py-2 text-right">{eur(y.costActualEur)}</td><td className="px-4 py-2 text-right font-medium">{eur(y.savingEur)} <span className="text-xs text-slate-400">{inr(y.savingEur * fx)}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <div className="text-[13px] font-medium text-slate-500">One-line pitch (for LinkedIn or the export manager)</div>
            <p className="mt-1 text-[15px] text-slate-800">{pitch}</p>
          </div>
          <button className={btn.secondary} onClick={() => { navigator.clipboard.writeText(pitch); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy"}</button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">Method: certificates per tonne = max(0, SEE − benchmark × free-allocation share). Benchmarks and default values in this demo are illustrative; load the official EU figures in Settings before quoting numbers to a customer. Costs fall on the EU importer, who passes them back through price.</p>
      </Card>
    </div>
  );
}
