import { FUEL_FACTORS, PRICES_INDIRECT, ROUTES } from "@/lib/factors";
import type { InstallationResult, Supplier } from "@/lib/types";

export type Suggestion = { title: string; detail: string; savingT?: number };

/** Data-driven reduction ideas first, then the route's standard levers. */
export function suggestions(s: Supplier, inst: InstallationResult): Suggestion[] {
  const out: Suggestion[] = [];
  const ng = FUEL_FACTORS.natural_gas.efPerTJ;
  for (const f of inst.fuelEmissions) {
    if (f.fuel === "furnace_oil" || f.fuel === "coal" || f.fuel === "pet_coke") {
      const cut = f.tco2 * (1 - ng / FUEL_FACTORS[f.fuel].efPerTJ);
      if (cut > 1)
        out.push({
          title: `Switch ${FUEL_FACTORS[f.fuel].label.toLowerCase()} to PNG`,
          detail: `Same heat from natural gas emits ${Math.round((1 - ng / FUEL_FACTORS[f.fuel].efPerTJ) * 100)}% less CO₂: about ${cut.toFixed(0)} tCO₂ over this period${inst.outputTonnes ? ` (${(cut / inst.outputTonnes).toFixed(3)} t per tonne of product)` : ""}.`,
          savingT: cut,
        });
    }
  }
  for (const p of inst.products) {
    if (p.usesDefaultPrecursor && p.precursorDirect > 0)
      out.push({
        title: `${p.name}: replace precursor default values with actual data`,
        detail: `Precursors add ${(p.precursorDirect / Math.max(p.outputTonnes, 1)).toFixed(2)} tCO₂ per tonne on defaults, which is ${Math.round((p.precursorDirect / Math.max(p.attributedDirect + p.precursorDirect, 1e-9)) * 100)}% of this product's direct footprint. Invite the upstream producer to CarbonLink; their passport flows into this number automatically.`,
      });
    if (p.sector && PRICES_INDIRECT[p.sector] && p.seeIndirect > 0)
      out.push({ title: `${p.name}: indirect emissions are priced for this sector`, detail: "Every MWh of qualifying renewable power (with a PPA or direct connection, and evidence) lowers the CBAM bill directly." });
  }
  const route = ROUTES[s.products[0]?.route ?? ""];
  if (route) for (const l of route.levers) out.push({ title: l, detail: `Standard lever for ${route.label.toLowerCase()}.` });
  return out.slice(0, 6);
}
