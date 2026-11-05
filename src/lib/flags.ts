/**
 * Data-quality and anomaly rules. Each rule has a stable ID so a reviewer's
 * accept/override decisions and a verifier's queries can refer to it.
 */
import { productForRow, toTonnes } from "@/lib/calc";
import { FUEL_FACTORS, ROUTES, cnGroup } from "@/lib/factors";
import type { ActivityRow, Flag, InstallationResult, Severity, Supplier } from "@/lib/types";

const WEIGHT: Record<Severity, number> = { critical: 25, major: 10, minor: 3, info: 0 };

/** All calendar months (YYYY-MM) a row covers. */
export function monthsCovered(r: Pick<ActivityRow, "periodStart" | "periodEnd">): string[] {
  if (!r.periodStart) return [];
  const start = new Date(r.periodStart + "T00:00:00Z");
  const end = new Date((r.periodEnd ?? r.periodStart) + "T00:00:00Z");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const out: string[] = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (d <= end && out.length < 60) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

function monthRange(a: string, b: string): string[] {
  return monthsCovered({ periodStart: a, periodEnd: b });
}

/** The route that dominates output: used for intensity screening. */
export function dominantRoute(s: Supplier, inst: InstallationResult): string | null {
  const top = [...inst.products].sort((a, b) => b.outputTonnes - a.outputTonnes)[0];
  const p = s.products.find((x) => x.id === top?.productId) ?? s.products[0];
  return p?.route ?? null;
}

export function runFlags(s: Supplier, inst: InstallationResult): Flag[] {
  const flags: Flag[] = [];
  let n = 0;
  const add = (rule: string, severity: Severity, title: string, detail: string, rowIds: string[] = []) =>
    flags.push({ id: `${rule}-${++n}`, rule, severity, title, detail, rowIds });

  const rows = s.activity;
  const elec = rows.filter((r) => r.kind === "electricity" || r.kind === "renewable_electricity");
  const prod = rows.filter((r) => r.kind === "production");
  const prec = rows.filter((r) => r.kind === "precursor");

  // Scope
  for (const p of s.products) {
    if (!cnGroup(p.cnCode)) add("R18", "major", `${p.name}: CN code ${p.cnCode} is not in the CBAM goods list we know`, "Check the CN code. Goods outside CBAM Annex I need no embedded-emissions data; a wrong code means wrong default values and the wrong benchmark.");
  }

  if (!prod.length) add("R01", "critical", "No production data", "Embedded emissions are per tonne of output. Upload the production register or weighbridge slips for the same period as the energy bills.");
  if (!elec.length) add("R02", "critical", "No electricity bills", "Upload the DISCOM bills for every month in the reporting period.");

  // Intensity screening
  const routeKey = dominantRoute(s, inst);
  const route = routeKey ? ROUTES[routeKey] : null;
  if (route && inst.intensity.kwhPerT !== null) {
    const [lo, hi] = route.kwhPerT;
    const v = inst.intensity.kwhPerT;
    if (v < lo || v > hi)
      add("R03", v < lo * 0.5 || v > hi * 2 ? "critical" : "major", `Electricity intensity ${v.toFixed(0)} kWh/t is outside the usual ${lo}–${hi} kWh/t for ${route.label.toLowerCase()}`,
        v < lo
          ? "Too low usually means missing bills (a meter or month not uploaded) or production over-reported (e.g. traded goods counted as produced)."
          : "Too high usually means missing production entries, an extra meter (colony, another unit) included, or a kWh/kVAh mix-up on the bill.",
        [...elec, ...prod].map((r) => r.id));
  }
  if (route && inst.intensity.fuelGJPerT !== null) {
    const [lo, hi] = route.fuelGJPerT;
    const v = inst.intensity.fuelGJPerT;
    if (v > hi) add("R04", "major", `Fuel intensity ${v.toFixed(2)} GJ/t is above the usual ${lo}–${hi} GJ/t for this route`, "Check for fuel used elsewhere (vehicles, other units) or a unit error (kL entered as L).", rows.filter((r) => r.kind === "fuel").map((r) => r.id));
    if (v < lo && lo > 0) add("R04", "major", `Fuel intensity ${v.toFixed(2)} GJ/t is below the usual ${lo}–${hi} GJ/t for this route`, "Reheating/melting furnaces normally burn fuel. Missing fuel invoices would understate direct emissions, which a verifier will catch.", rows.filter((r) => r.kind === "fuel").map((r) => r.id));
  }

  // Coverage
  if (inst.periodStart && inst.periodEnd) {
    const all = monthRange(inst.periodStart, inst.periodEnd);
    const elecMonths = new Set(elec.flatMap(monthsCovered));
    const prodMonths = new Set(prod.flatMap(monthsCovered));
    const missingE = all.filter((m) => !elecMonths.has(m));
    const missingP = all.filter((m) => !prodMonths.has(m));
    if (elec.length && missingE.length) add("R05", "major", `Electricity bills missing for ${missingE.length} month(s): ${missingE.join(", ")}`, "Energy and production must cover the same period, or the per-tonne figure is wrong.");
    if (prod.length && missingP.length) add("R05", "major", `Production data missing for ${missingP.length} month(s): ${missingP.join(", ")}`, "Energy and production must cover the same period, or the per-tonne figure is wrong.");
    if (all.length < 12) add("R14", "minor", `Data covers ${all.length} month(s)`, "CBAM reporting uses a full calendar year (or a 12-month period agreed with the verifier). Partial periods are fine for a pilot estimate.");
  }

  // Byte-identical re-uploads are reported once (R07) and kept out of the checks below.
  const firstBySha = new Map<string, string>();
  const dupEvidence = new Set<string>();
  for (const e of s.evidence) {
    if (firstBySha.has(e.sha256)) dupEvidence.add(e.id);
    else firstBySha.set(e.sha256, e.id);
  }

  // Overlapping bills for the same account (double counting)
  const byAccount = new Map<string, ActivityRow[]>();
  for (const r of rows.filter((x) => (x.kind === "electricity" || x.kind === "fuel") && !dupEvidence.has(x.evidenceId ?? ""))) {
    const ev = s.evidence.find((e) => e.id === r.evidenceId);
    const key = `${r.kind}|${r.fuel ?? ""}|${ev?.data.accountRef ?? "-"}`;
    byAccount.set(key, [...(byAccount.get(key) ?? []), r]);
  }
  for (const [key, list] of byAccount) {
    if (key.endsWith("|-") && list[0].kind === "fuel") continue; // invoices without account refs legitimately repeat
    const sorted = list.filter((r) => r.periodStart && r.periodEnd && r.periodStart !== r.periodEnd).sort((a, b) => a.periodStart!.localeCompare(b.periodStart!));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].periodStart! <= sorted[i - 1].periodEnd!) {
        add("R06", "major", "Two bills cover overlapping dates for the same meter", `${sorted[i - 1].periodStart}→${sorted[i - 1].periodEnd} and ${sorted[i].periodStart}→${sorted[i].periodEnd}. This double-counts consumption unless one is a revised bill.`, [sorted[i - 1].id, sorted[i].id]);
      }
    }
  }

  // Duplicate evidence files
  const seen = new Map<string, string>();
  for (const e of s.evidence) {
    if (seen.has(e.sha256)) add("R07", "critical", `Duplicate upload: ${e.fileName}`, `Identical to ${seen.get(e.sha256)} (same SHA-256). Its rows are counted twice.`, rows.filter((r) => r.evidenceId === e.id).map((r) => r.id));
    else seen.set(e.sha256, e.fileName);
  }
  const accountDupes = new Map<string, string[]>();
  for (const e of s.evidence) {
    if (!e.data.accountRef || e.data.docType === "production_register" || dupEvidence.has(e.id)) continue;
    const key = `${e.data.docType}|${e.data.accountRef}|${e.data.periodStart}|${e.data.periodEnd}`;
    accountDupes.set(key, [...(accountDupes.get(key) ?? []), e.fileName]);
  }
  for (const [, names] of accountDupes) if (names.length > 1 && new Set(names).size > 1) add("R07", "major", "Same bill uploaded twice (different scans)", `${names.join(" and ")} have the same reference number and period.`);

  // Evidence & confirmation
  const noEvidence = rows.filter((r) => !r.evidenceId);
  if (noEvidence.length) add("R09", "major", `${noEvidence.length} value(s) have no source document`, "Verifiers sample values back to source documents. Attach a bill, invoice or register page to every manually entered number.", noEvidence.map((r) => r.id));
  const lowConf = rows.filter((r) => r.lowConfidence && !r.confirmed);
  if (lowConf.length) add("R08", "minor", `${lowConf.length} value(s) read with low confidence`, "The scan was blurred, handwritten or ambiguous. Compare with the original and confirm or correct.", lowConf.map((r) => r.id));
  const unconfirmed = rows.filter((r) => !r.confirmed && !r.lowConfidence);
  if (unconfirmed.length) add("R19", "minor", `${unconfirmed.length} extracted value(s) not yet confirmed`, "Confirm each value against its document before sending to a verifier.", unconfirmed.map((r) => r.id));

  // Product mapping & precursors
  const orphanProd = prod.filter((r) => !productForRow(s, r));
  if (orphanProd.length) add("R10", "major", `${orphanProd.length} production entr${orphanProd.length === 1 ? "y is" : "ies are"} not linked to a product`, "Link each production line to the product (CN code) it belongs to.", orphanProd.map((r) => r.id));

  for (const p of inst.products) {
    const product = s.products.find((x) => x.id === p.productId)!;
    const preRows = prec.filter((r) => productForRow(s, r) === p.productId);
    const preT = preRows.reduce((a, r) => a + (toTonnes(r) ?? 0), 0);
    const needsPrecursor = product.precursors.length > 0;
    if (needsPrecursor && p.outputTonnes > 0 && !preRows.length)
      add("R13", "critical", `${p.name}: no precursor purchases recorded`, "This route turns purchased material (billets, rod, ingots, clinker) into product. Without purchase quantities, precursor emissions, usually the largest share, are zero.", []);
    if (preRows.length && p.outputTonnes > 0) {
      const yieldPct = (p.outputTonnes / preT) * 100;
      if (yieldPct > 102) add("R13", "critical", `${p.name}: output (${p.outputTonnes.toFixed(1)} t) exceeds precursor input (${preT.toFixed(1)} t)`, "Physically impossible (yield over 100%) unless opening stock was used. Record the stock change or check for missing purchase invoices.", preRows.map((r) => r.id));
      else if (yieldPct < 75) add("R13", yieldPct < 50 ? "major" : "minor", `${p.name}: yield ${yieldPct.toFixed(0)}% is low`, "A typical yield is 85–98%. Very low yield may mean purchases for other products are booked here.", preRows.map((r) => r.id));
    }
    if (p.usesDefaultPrecursor) add("R11", "minor", `${p.name}: precursor uses EU default values`, "Defaults are deliberately high. Invite the upstream mill to CarbonLink: their passport replaces the default and usually cuts this product's footprint.", preRows.map((r) => r.id));
    if (p.defaultPriced !== null && p.seePriced > p.defaultPriced && p.outputTonnes > 0)
      add("R12", "info", `${p.name}: actual footprint (${p.seePriced.toFixed(2)}) is above the default (${p.defaultPriced.toFixed(2)})`, "Check the data first. If it holds, discuss with the buyer: actuals above defaults are rare and invite verifier scrutiny.");
  }

  // Renewables & biomass
  const re = rows.filter((r) => r.kind === "renewable_electricity");
  if (re.length) add("R15", "minor", "Renewable electricity claimed", "For CBAM, renewable power counts only with a direct technical link or a qualifying power purchase agreement. Attach the PPA/open-access approval and meter readings.", re.map((r) => r.id));
  const bio = rows.filter((r) => r.kind === "fuel" && r.fuel && FUEL_FACTORS[r.fuel].biogenic);
  if (bio.length) add("R16", "info", "Biomass fuel counted as zero-emission", "Keep proof of the biomass source; non-sustainable biomass is counted as fossil.", bio.map((r) => r.id));

  const accounts = new Set(s.evidence.filter((e) => e.data.docType === "electricity_bill" && e.data.accountRef).map((e) => e.data.accountRef));
  if (accounts.size > 1) add("R17", "info", `${accounts.size} electricity connections found`, `Consumer numbers: ${[...accounts].join(", ")}. Confirm all belong to this installation (not a colony, office or another unit).`);

  return flags.sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity]);
}

export type Scorecard = {
  quality: number; // 0–100
  completeness: number; // 0–100
  verificationReady: boolean;
  grade: "A" | "B" | "C" | "D";
};

export function scorecard(s: Supplier, inst: InstallationResult, flags: Flag[]): Scorecard {
  const penalty = flags.reduce((a, f) => a + WEIGHT[f.severity], 0);
  const quality = Math.max(0, Math.min(100, 100 - penalty));
  const checks = [
    s.activity.some((r) => r.kind === "electricity"),
    s.activity.some((r) => r.kind === "production"),
    s.products.every((p) => !p.precursors.length || s.activity.some((r) => r.kind === "precursor" && productForRow(s, r) === p.id)),
    inst.months >= 12,
    s.activity.length > 0 && s.activity.every((r) => r.evidenceId),
    s.activity.length > 0 && s.activity.every((r) => r.confirmed),
  ];
  const completeness = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const verificationReady = !flags.some((f) => f.severity === "critical" || f.severity === "major") && completeness >= 80;
  const combined = (quality + completeness) / 2;
  const grade = combined >= 85 ? "A" : combined >= 70 ? "B" : combined >= 50 ? "C" : "D";
  return { quality, completeness, verificationReady, grade };
}
