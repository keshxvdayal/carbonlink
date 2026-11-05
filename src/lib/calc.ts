/**
 * Embedded-emissions engine (CBAM simplified method for one installation).
 *
 *   Direct (attributed) = Σ fuel × NCV × EF  +  process inputs (electrodes) × EF
 *   Indirect            = grid MWh × grid EF       (renewables with evidence → 0)
 *   Per product p:
 *     attributed_p      = installation total × mass share of p in output        ← simplification, see README
 *     precursor_p       = Σ precursor tonnes consumed × precursor SEE
 *     SEE_p             = (attributed_p + precursor_p) / output_p
 *
 * The functions are pure: given the same rows and settings they always return
 * the same numbers, so every result can be re-derived by a verifier.
 */
import { FUEL_FACTORS, GRID_EF_DEFAULT, PRICES_INDIRECT, PROCESS_INPUT_EF_PER_T, ROUTES, cnGroup, convert, defaultFor } from "@/lib/factors";
import type { ActivityRow, Fuel, InstallationResult, Precursor, ProductResult, Settings, Supplier, Unit } from "@/lib/types";

export type PassportResolver = (supplierId: string, productId: string) => { seeDirect: number; seeIndirect: number } | null;

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

export function fuelEmissions(fuel: Fuel, quantity: number, unit: Unit): { energyGJ: number; tco2: number } | null {
  const f = FUEL_FACTORS[fuel];
  const base = convert(quantity, unit, f.baseUnit);
  if (base === null) return null;
  const energyGJ = base * f.ncvGJ;
  return { energyGJ, tco2: (energyGJ / 1000) * f.efPerTJ };
}

export function toTonnes(row: Pick<ActivityRow, "quantity" | "unit">): number | null {
  return convert(row.quantity, row.unit, "t");
}

export function toMWh(row: Pick<ActivityRow, "quantity" | "unit">): number | null {
  return convert(row.quantity, row.unit, "MWh");
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Which product a production/precursor row belongs to: explicit link first, then name match. */
export function productForRow(s: Supplier, row: ActivityRow): string | null {
  if (row.productId && s.products.some((p) => p.id === row.productId)) return row.productId;
  if (s.products.length === 1 && row.kind === "production") return s.products[0].id;
  const m = norm(row.material);
  if (!m) return null;
  // A product name in the text ("wire rod for Hex nuts") beats a precursor-name match.
  for (const p of s.products) {
    const pn = norm(p.name);
    if (m.includes(pn) || pn.includes(m)) return p.id;
  }
  if (row.kind !== "precursor") return null;
  if (s.products.length === 1) return s.products[0].id;
  // Only assign by precursor name when exactly one product uses that precursor; otherwise it is ambiguous.
  const byPrecursor = s.products.filter((p) => p.precursors.some((pc) => norm(pc.name) && (m.includes(norm(pc.name)) || norm(pc.name).includes(m))));
  return byPrecursor.length === 1 ? byPrecursor[0].id : null;
}

export function precursorForRow(product: { precursors: Precursor[] }, row: ActivityRow): Precursor | null {
  const m = norm(row.material);
  return product.precursors.find((pc) => m && (m.includes(norm(pc.name)) || norm(pc.name).includes(m))) ?? product.precursors[0] ?? null;
}

export function precursorSee(pc: Precursor, resolve?: PassportResolver): { direct: number; indirect: number; resolved: "passport" | "stored" } {
  if (pc.source === "passport" && pc.linkedSupplierId && pc.linkedProductId && resolve) {
    const r = resolve(pc.linkedSupplierId, pc.linkedProductId);
    if (r) return { direct: r.seeDirect, indirect: r.seeIndirect, resolved: "passport" };
  }
  return { direct: pc.seeDirect, indirect: pc.seeIndirect, resolved: "stored" };
}

function monthsBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const days = (Date.parse(b) - Date.parse(a)) / 86_400_000 + 1;
  return Math.max(0, Math.round((days / 30.44) * 10) / 10);
}

export function computeInstallation(s: Supplier, settings: Pick<Settings, "gridEf" | "defaultOverrides">, resolve?: PassportResolver): InstallationResult {
  const rows = s.activity;
  const gridEf = settings.gridEf || GRID_EF_DEFAULT;

  // Fuels, grouped by fuel type
  const byFuel = new Map<Fuel, { quantity: number; unit: Unit; energyGJ: number; tco2: number }>();
  for (const r of rows) {
    if (r.kind !== "fuel" || !r.fuel) continue;
    const e = fuelEmissions(r.fuel, r.quantity, r.unit);
    if (!e) continue;
    const base = FUEL_FACTORS[r.fuel].baseUnit;
    const prev = byFuel.get(r.fuel) ?? { quantity: 0, unit: base, energyGJ: 0, tco2: 0 };
    prev.quantity += convert(r.quantity, r.unit, base) ?? 0;
    prev.energyGJ += e.energyGJ;
    prev.tco2 += e.tco2;
    byFuel.set(r.fuel, prev);
  }
  const fuelList = [...byFuel.entries()].map(([fuel, v]) => ({ fuel, quantity: round(v.quantity, 2), unit: v.unit, energyGJ: round(v.energyGJ, 2), tco2: round(v.tco2) }));
  const fuelTotal = fuelList.reduce((a, f) => a + f.tco2, 0);
  const fuelGJ = fuelList.reduce((a, f) => a + f.energyGJ, 0);

  const processEmissions = rows.filter((r) => r.kind === "process_input").reduce((a, r) => a + (toTonnes(r) ?? 0) * PROCESS_INPUT_EF_PER_T, 0);
  const directTotal = fuelTotal + processEmissions;

  const electricityMWh = rows.filter((r) => r.kind === "electricity").reduce((a, r) => a + (toMWh(r) ?? 0), 0);
  const renewableMWh = rows.filter((r) => r.kind === "renewable_electricity").reduce((a, r) => a + (toMWh(r) ?? 0), 0);
  const indirectTotal = electricityMWh * gridEf;

  // Output per product
  const output = new Map<string, number>();
  for (const r of rows) {
    if (r.kind !== "production") continue;
    const pid = productForRow(s, r);
    if (!pid) continue;
    output.set(pid, (output.get(pid) ?? 0) + (toTonnes(r) ?? 0));
  }
  const outputTonnes = [...output.values()].reduce((a, b) => a + b, 0);

  // Precursors per product
  const pre = new Map<string, { direct: number; indirect: number; usesDefault: boolean }>();
  for (const r of rows) {
    if (r.kind !== "precursor") continue;
    const pid = productForRow(s, r);
    const product = s.products.find((p) => p.id === pid);
    if (!product) continue;
    const pc = precursorForRow(product, r);
    const t = toTonnes(r) ?? 0;
    const prev = pre.get(product.id) ?? { direct: 0, indirect: 0, usesDefault: false };
    if (pc) {
      const see = precursorSee(pc, resolve);
      prev.direct += t * see.direct;
      prev.indirect += t * see.indirect;
      if (pc.source === "default" || (pc.source === "passport" && see.resolved === "stored")) prev.usesDefault = true;
    }
    pre.set(product.id, prev);
  }

  const products: ProductResult[] = s.products.map((p) => {
    const out = output.get(p.id) ?? 0;
    const share = outputTonnes > 0 ? out / outputTonnes : 0;
    const attributedDirect = directTotal * share;
    const attributedIndirect = indirectTotal * share;
    const pr = pre.get(p.id) ?? { direct: 0, indirect: 0, usesDefault: false };
    const seeDirect = out > 0 ? (attributedDirect + pr.direct) / out : 0;
    const seeIndirect = out > 0 ? (attributedIndirect + pr.indirect) / out : 0;
    const sector = cnGroup(p.cnCode)?.sector ?? ROUTES[p.route]?.sector ?? null;
    const pricesIndirect = sector ? PRICES_INDIRECT[sector] : false;
    const def = defaultFor(p.cnCode, settings.defaultOverrides);
    return {
      productId: p.id,
      name: p.name,
      cnCode: p.cnCode,
      sector,
      outputTonnes: round(out, 3),
      massShare: round(share, 4),
      attributedDirect: round(attributedDirect),
      attributedIndirect: round(attributedIndirect),
      precursorDirect: round(pr.direct),
      precursorIndirect: round(pr.indirect),
      seeDirect: round(seeDirect),
      seeIndirect: round(seeIndirect),
      seePriced: round(pricesIndirect ? seeDirect + seeIndirect : seeDirect),
      defaultDirect: def?.direct ?? null,
      defaultIndirect: def?.indirect ?? null,
      defaultPriced: def ? round(pricesIndirect ? def.direct + def.indirect : def.direct) : null,
      usesDefaultPrecursor: pr.usesDefault,
    };
  });

  const starts = rows.map((r) => r.periodStart).filter(Boolean).sort() as string[];
  const ends = rows.map((r) => r.periodEnd ?? r.periodStart).filter(Boolean).sort() as string[];
  const periodStart = starts[0] ?? null;
  const periodEnd = ends[ends.length - 1] ?? null;

  return {
    periodStart,
    periodEnd,
    months: monthsBetween(periodStart, periodEnd),
    fuelEmissions: fuelList,
    processEmissions: round(processEmissions),
    directTotal: round(directTotal),
    electricityMWh: round(electricityMWh, 3),
    renewableMWh: round(renewableMWh, 3),
    indirectTotal: round(indirectTotal),
    outputTonnes: round(outputTonnes, 3),
    products,
    intensity: {
      kwhPerT: outputTonnes > 0 ? round(((electricityMWh + renewableMWh) * 1000) / outputTonnes, 1) : null,
      fuelGJPerT: outputTonnes > 0 ? round(fuelGJ / outputTonnes, 3) : null,
    },
  };
}
