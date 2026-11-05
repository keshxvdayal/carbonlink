/**
 * "Default vs actual" CBAM cost simulator.
 *
 *   certificates/t = max(0, SEE − benchmark × free-allocation share(year))
 *   default SEE    = EU default × (1 + mark-up(year))
 *   cost           = certificates/t × tonnes × (CBAM price − carbon price paid in India)
 *
 * Actual cost is capped at the default cost: an importer can always fall back to defaults.
 *
 * The free-allocation adjustment depends on the benchmark, not on the reported
 * SEE, so every tonne of CO2 you prove you did NOT emit is saved at the full
 * certificate price. That is why actual data pays for itself.
 */
import { FREE_ALLOCATION_SHARE, ILLUSTRATIVE_BENCHMARK, defaultMarkup } from "@/lib/factors";
import type { Sector } from "@/lib/types";

export type SimInput = {
  sector: Sector;
  tonnes: number;
  seeActual: number;
  seeDefault: number;
  etsPriceEur: number;
  originCarbonPriceEur: number;
  benchmark?: number;
};

export type SimYear = {
  year: number;
  markup: number;
  freeShare: number;
  defaultWithMarkup: number;
  certsPerTDefault: number;
  certsPerTActual: number;
  costDefaultEur: number;
  costActualEur: number;
  savingEur: number;
};

export const SIM_YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034];

export function simulateYear(i: SimInput, year: number): SimYear {
  const markup = defaultMarkup(year);
  const freeShare = FREE_ALLOCATION_SHARE[year] ?? 0;
  const bm = i.benchmark ?? ILLUSTRATIVE_BENCHMARK[i.sector];
  const deduction = bm * freeShare;
  const defaultWithMarkup = i.seeDefault * (1 + markup);
  const certsPerTDefault = Math.max(0, defaultWithMarkup - deduction);
  // If actuals come out above the marked-up default, the importer would declare the default instead.
  const certsPerTActual = Math.min(certsPerTDefault, Math.max(0, i.seeActual - deduction));
  const netPrice = Math.max(0, i.etsPriceEur - i.originCarbonPriceEur);
  const costDefaultEur = certsPerTDefault * i.tonnes * netPrice;
  const costActualEur = certsPerTActual * i.tonnes * netPrice;
  return { year, markup, freeShare, defaultWithMarkup, certsPerTDefault, certsPerTActual, costDefaultEur, costActualEur, savingEur: costDefaultEur - costActualEur };
}

export function simulate(i: SimInput, years = SIM_YEARS): SimYear[] {
  return years.map((y) => simulateYear(i, y));
}
