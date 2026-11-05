/**
 * Reference data for the emissions engine.
 *
 * EVERY NUMBER IN THIS FILE MUST BE SIGNED OFF BY YOUR CBAM ADVISOR BEFORE A PILOT.
 * Sources are noted per block. Values marked ILLUSTRATIVE are placeholders that
 * keep the demo realistic; replace them with the official figures (the EU's
 * published default values for India and the CBAM benchmarks) via Settings or here.
 */
import type { Fuel, Sector, Unit } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Fuels: IPCC 2006 Guidelines Vol. 2 Ch. 1 default NCV and CO2 EF.   *
 * Densities are typical Indian specifications.                        *
 * ------------------------------------------------------------------ */
export type FuelFactor = {
  label: string;
  /** Unit the factor is expressed per. */
  baseUnit: Unit;
  /** Net calorific value, GJ per base unit. */
  ncvGJ: number;
  /** tCO2 per TJ. */
  efPerTJ: number;
  biogenic?: boolean;
  source: string;
};

export const FUEL_FACTORS: Record<Fuel, FuelFactor> = {
  diesel: { label: "Diesel / HSD", baseUnit: "L", ncvGJ: 0.832 * 0.043, efPerTJ: 74.1, source: "IPCC 2006 gas/diesel oil; density 0.832 kg/L" },
  furnace_oil: { label: "Furnace oil / LSHS", baseUnit: "L", ncvGJ: 0.95 * 0.0404, efPerTJ: 77.4, source: "IPCC 2006 residual fuel oil; density 0.95 kg/L" },
  lpg: { label: "LPG", baseUnit: "kg", ncvGJ: 0.0473, efPerTJ: 63.1, source: "IPCC 2006 LPG" },
  natural_gas: { label: "Natural gas / PNG", baseUnit: "SCM", ncvGJ: 0.036, efPerTJ: 56.1, source: "IPCC 2006 natural gas; NCV 36 MJ/SCM (check supplier GCV on bill)" },
  coal: { label: "Coal (Indian non-coking)", baseUnit: "t", ncvGJ: 18.9, efPerTJ: 96.1, source: "IPCC 2006 sub-bituminous; replace with lab NCV if available" },
  coke: { label: "Met coke", baseUnit: "t", ncvGJ: 28.2, efPerTJ: 107.0, source: "IPCC 2006 coke oven coke" },
  pet_coke: { label: "Pet coke", baseUnit: "t", ncvGJ: 32.5, efPerTJ: 97.5, source: "IPCC 2006 petroleum coke" },
  biomass: { label: "Biomass (briquettes, husk)", baseUnit: "t", ncvGJ: 11.6, efPerTJ: 0, biogenic: true, source: "Biogenic CO2 counted as zero if sustainability criteria are met" },
};

/** Graphite electrodes / carbon additions: ~99.8% C → 44/12 × 0.998 tCO2 per t. */
export const PROCESS_INPUT_EF_PER_T = 3.66;

/** Convert a quantity to a target unit. Returns null when the units are not compatible. */
export function convert(quantity: number, from: Unit, to: Unit): number | null {
  if (from === to) return quantity;
  const mass: Partial<Record<Unit, number>> = { kg: 0.001, t: 1 };
  const vol: Partial<Record<Unit, number>> = { L: 1, kL: 1000 };
  const energy: Partial<Record<Unit, number>> = { kWh: 1, MWh: 1000 };
  for (const table of [mass, vol, energy]) {
    if (table[from] !== undefined && table[to] !== undefined) return (quantity * table[from]!) / table[to]!;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Grid electricity                                                    *
 * ------------------------------------------------------------------ */
export const GRID_EF_DEFAULT = 0.727; // tCO2/MWh. CEA CO2 Baseline Database, weighted average. Confirm the latest version.

/* ------------------------------------------------------------------ *
 * Production routes and screening ranges (indicative; tune with advisor)
 * kWh/t and fuel GJ/t of OUTPUT for the installation as a whole.      *
 * ------------------------------------------------------------------ */
export type Route = {
  label: string;
  sector: Sector;
  kwhPerT: [number, number];
  fuelGJPerT: [number, number];
  /** Short, practical reduction levers shown on the supplier scorecard. */
  levers: string[];
};

export const ROUTES: Record<string, Route> = {
  steel_induction: {
    label: "Induction furnace melting (scrap / sponge iron)",
    sector: "iron_steel",
    kwhPerT: [450, 1100],
    fuelGJPerT: [0, 1],
    levers: ["Raise scrap share vs coal-based sponge iron (precursor emissions dominate)", "Lid/cover practice and charge preheating cut 30–60 kWh/t", "Green open-access power lowers indirect emissions buyers increasingly ask for"],
  },
  steel_eaf: {
    label: "Electric arc furnace (scrap / DRI)",
    sector: "iron_steel",
    kwhPerT: [300, 900],
    fuelGJPerT: [0, 1.5],
    levers: ["Track electrode consumption per heat; it is a direct-emission line", "Higher scrap share lowers precursor emissions", "Oxy-fuel burners on natural gas instead of oil"],
  },
  steel_rerolling: {
    label: "Re-rolling mill (billet reheating + rolling)",
    sector: "iron_steel",
    kwhPerT: [60, 250],
    fuelGJPerT: [0.8, 2.5],
    levers: ["Switch reheating furnace from furnace oil/coal to PNG (~25–30% less CO2 per GJ)", "Hot charging of billets cuts reheating fuel", "Recuperators on the reheating furnace"],
  },
  steel_fasteners: {
    label: "Forging / fasteners & steel articles (incl. heat treatment)",
    sector: "iron_steel",
    kwhPerT: [150, 1200],
    fuelGJPerT: [0, 3],
    levers: ["Precursor (wire rod) emissions are usually >80% of the total: ask your rod mill for actual data", "Heat-treatment furnace load factor and insulation", "Rooftop solar with proper metering evidence"],
  },
  steel_wire: {
    label: "Wire drawing",
    sector: "iron_steel",
    kwhPerT: [50, 300],
    fuelGJPerT: [0, 1.5],
    levers: ["Precursor rod emissions dominate: get actual data from the rod supplier", "Annealing furnace fuel switch to PNG"],
  },
  al_remelt: {
    label: "Secondary aluminium (scrap remelting)",
    sector: "aluminium",
    kwhPerT: [50, 400],
    fuelGJPerT: [2, 7],
    levers: ["Furnace oil → PNG in melting furnaces", "Regenerative burners", "Scrap pre-sorting to reduce dross and remelting"],
  },
  al_extrusion: {
    label: "Aluminium extrusion (billet → profiles)",
    sector: "aluminium",
    kwhPerT: [300, 1200],
    fuelGJPerT: [0.8, 4],
    levers: ["Billet source decides most of the footprint: secondary billets have far lower precursor emissions", "Billet heater: induction on green power vs gas", "Scrap/recovery rate on extrusion"],
  },
  al_rolling: {
    label: "Aluminium rolling (sheets, foil)",
    sector: "aluminium",
    kwhPerT: [300, 1500],
    fuelGJPerT: [0.5, 4],
    levers: ["Ingot/slab source is the main lever", "Annealing furnace fuel switch"],
  },
  cement_grinding: {
    label: "Cement grinding unit (purchased clinker)",
    sector: "cement",
    kwhPerT: [25, 60],
    fuelGJPerT: [0, 0.5],
    levers: ["Higher fly ash/slag blending lowers clinker factor (precursor emissions)", "Indirect emissions count for cement: green power directly reduces CBAM cost"],
  },
};

/* ------------------------------------------------------------------ *
 * CN codes (CBAM Regulation (EU) 2023/956, Annex I), grouped.         *
 * ------------------------------------------------------------------ */
export type CnGroup = { prefix: string; label: string; sector: Sector };

export const CN_GROUPS: CnGroup[] = [
  { prefix: "7201", label: "Pig iron", sector: "iron_steel" },
  { prefix: "7203", label: "Sponge iron / DRI", sector: "iron_steel" },
  { prefix: "7206", label: "Iron & non-alloy steel ingots", sector: "iron_steel" },
  { prefix: "7207", label: "Semi-finished non-alloy steel (billets, blooms)", sector: "iron_steel" },
  { prefix: "7208", label: "Flat-rolled, hot-rolled ≥600 mm", sector: "iron_steel" },
  { prefix: "7213", label: "Bars & rods, hot-rolled, in coils (wire rod)", sector: "iron_steel" },
  { prefix: "7214", label: "Other bars & rods (TMT, rounds)", sector: "iron_steel" },
  { prefix: "7216", label: "Angles, shapes & sections", sector: "iron_steel" },
  { prefix: "7217", label: "Wire of iron or non-alloy steel", sector: "iron_steel" },
  { prefix: "7228", label: "Bars & rods of other alloy steel", sector: "iron_steel" },
  { prefix: "7304", label: "Seamless tubes & pipes", sector: "iron_steel" },
  { prefix: "7306", label: "Other tubes & pipes (welded)", sector: "iron_steel" },
  { prefix: "7308", label: "Structures & parts of structures", sector: "iron_steel" },
  { prefix: "7318", label: "Screws, bolts, nuts, washers, rivets", sector: "iron_steel" },
  { prefix: "7326", label: "Other articles of iron or steel", sector: "iron_steel" },
  { prefix: "7601", label: "Unwrought aluminium (ingots, billets)", sector: "aluminium" },
  { prefix: "7604", label: "Aluminium bars, rods & profiles", sector: "aluminium" },
  { prefix: "7605", label: "Aluminium wire", sector: "aluminium" },
  { prefix: "7606", label: "Aluminium plates, sheets, strip >0.2 mm", sector: "aluminium" },
  { prefix: "7607", label: "Aluminium foil", sector: "aluminium" },
  { prefix: "7608", label: "Aluminium tubes & pipes", sector: "aluminium" },
  { prefix: "7610", label: "Aluminium structures", sector: "aluminium" },
  { prefix: "7616", label: "Other articles of aluminium", sector: "aluminium" },
  { prefix: "252310", label: "Cement clinker", sector: "cement" },
  { prefix: "252329", label: "Portland cement", sector: "cement" },
  { prefix: "2814", label: "Ammonia", sector: "fertilisers" },
  { prefix: "3102", label: "Nitrogenous fertilisers", sector: "fertilisers" },
  { prefix: "280410", label: "Hydrogen", sector: "hydrogen" },
];

export function cnDigits(cn: string): string {
  return cn.replace(/\D/g, "");
}

export function cnGroup(cn: string): CnGroup | null {
  const d = cnDigits(cn);
  let best: CnGroup | null = null;
  for (const g of CN_GROUPS) if (d.startsWith(g.prefix) && (!best || g.prefix.length > best.prefix.length)) best = g;
  return best;
}

/** Steel/aluminium/hydrogen: only direct emissions are priced (Reg. 2023/956 Annex II). Cement/fertilisers: direct + indirect. */
export const PRICES_INDIRECT: Record<Sector, boolean> = {
  iron_steel: false,
  aluminium: false,
  hydrogen: false,
  cement: true,
  fertilisers: true,
};

/** UK CBAM (from 1 Jan 2027): sectors announced as in scope. Confirm against HMRC guidance. */
export const UK_CBAM_SECTORS: Sector[] = ["iron_steel", "aluminium", "cement", "fertilisers", "hydrogen"];

/* ------------------------------------------------------------------ *
 * Default values: ILLUSTRATIVE ONLY.                                  *
 * Replace with the EU's published country-specific default values     *
 * for India (tCO2e/t), via Settings → Default value overrides.        *
 * ------------------------------------------------------------------ */
export const ILLUSTRATIVE_DEFAULTS: Record<string, { direct: number; indirect: number }> = {
  "7201": { direct: 2.0, indirect: 0.1 },
  "7203": { direct: 2.9, indirect: 0.2 },
  "7206": { direct: 3.0, indirect: 0.4 },
  "7207": { direct: 3.0, indirect: 0.4 },
  "7208": { direct: 3.1, indirect: 0.45 },
  "7213": { direct: 3.1, indirect: 0.45 },
  "7214": { direct: 3.1, indirect: 0.45 },
  "7216": { direct: 3.1, indirect: 0.45 },
  "7217": { direct: 3.2, indirect: 0.6 },
  "7228": { direct: 3.3, indirect: 0.6 },
  "7304": { direct: 3.3, indirect: 0.7 },
  "7306": { direct: 3.3, indirect: 0.7 },
  "7308": { direct: 3.3, indirect: 0.7 },
  "7318": { direct: 3.4, indirect: 0.75 },
  "7326": { direct: 3.4, indirect: 0.75 },
  "7601": { direct: 1.9, indirect: 14.0 },
  "7604": { direct: 2.3, indirect: 14.5 },
  "7605": { direct: 2.3, indirect: 14.5 },
  "7606": { direct: 2.4, indirect: 14.8 },
  "7607": { direct: 2.5, indirect: 15.0 },
  "7608": { direct: 2.4, indirect: 14.8 },
  "7610": { direct: 2.5, indirect: 15.0 },
  "7616": { direct: 2.5, indirect: 15.0 },
  "252310": { direct: 0.9, indirect: 0.05 },
  "252329": { direct: 0.75, indirect: 0.08 },
  "2814": { direct: 2.6, indirect: 0.1 },
  "3102": { direct: 3.4, indirect: 0.2 },
  "280410": { direct: 10.0, indirect: 0.5 },
};

export function defaultFor(cn: string, overrides: Record<string, { direct: number; indirect: number }> = {}) {
  const d = cnDigits(cn);
  for (const table of [overrides, ILLUSTRATIVE_DEFAULTS]) {
    const key = Object.keys(table)
      .filter((k) => d.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (key) return { ...table[key], key, overridden: table === overrides };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Cost simulator parameters                                           *
 * ------------------------------------------------------------------ */

/** Mark-up applied to default values when actual data is not provided. */
export function defaultMarkup(year: number): number {
  if (year <= 2026) return 0.1;
  if (year === 2027) return 0.2;
  return 0.3;
}

/**
 * Share of the EU free allocation still granted to EU producers, which reduces
 * the CBAM certificates to surrender (Reg. 2023/956 Art. 31; ETS Directive Art. 10a(1a)).
 */
export const FREE_ALLOCATION_SHARE: Record<number, number> = {
  2026: 0.975,
  2027: 0.95,
  2028: 0.9,
  2029: 0.775,
  2030: 0.515,
  2031: 0.39,
  2032: 0.265,
  2033: 0.14,
  2034: 0,
};

/** ILLUSTRATIVE CBAM benchmarks per sector, tCO2/t. The real adjustment uses product- and route-specific benchmarks. */
export const ILLUSTRATIVE_BENCHMARK: Record<Sector, number> = {
  iron_steel: 1.37,
  aluminium: 1.46,
  cement: 0.69,
  fertilisers: 1.57,
  hydrogen: 6.84,
};

export const SECTOR_LABEL: Record<Sector, string> = {
  iron_steel: "Iron & steel",
  aluminium: "Aluminium",
  cement: "Cement",
  fertilisers: "Fertilisers",
  hydrogen: "Hydrogen",
};

/** Typical purchased precursors per route, pre-filled when a product is added. Scrap carries zero embedded emissions under CBAM. */
export const ROUTE_PRECURSORS: Record<string, { name: string; cnCode: string; zero?: boolean }[]> = {
  steel_induction: [{ name: "Steel scrap", cnCode: "7204", zero: true }, { name: "Sponge iron", cnCode: "7203 10 00" }],
  steel_eaf: [{ name: "Steel scrap", cnCode: "7204", zero: true }, { name: "Sponge iron", cnCode: "7203 10 00" }],
  steel_rerolling: [{ name: "Billets", cnCode: "7207 11 14" }],
  steel_fasteners: [{ name: "Wire rod", cnCode: "7213 91 10" }],
  steel_wire: [{ name: "Wire rod", cnCode: "7213 91 10" }],
  al_remelt: [{ name: "Aluminium scrap", cnCode: "7602", zero: true }],
  al_extrusion: [{ name: "Aluminium billets", cnCode: "7601 20 20" }],
  al_rolling: [{ name: "Aluminium ingots / slabs", cnCode: "7601 20 20" }],
  cement_grinding: [{ name: "Clinker", cnCode: "2523 10 00" }],
};
