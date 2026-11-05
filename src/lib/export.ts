/**
 * Buyer / verifier exports. The workbook is laid out after the sections of the
 * EU "communication template for installations" (installation, processes,
 * purchased precursors, specific embedded emissions) so an EU importer's team
 * can copy it across. It is NOT the official template file: map it into the
 * Commission's current .xlsx before filing.
 */
import ExcelJS from "exceljs";
import { FUEL_FACTORS, PROCESS_INPUT_EF_PER_T, ROUTES, SECTOR_LABEL } from "@/lib/factors";
import { supplierResult } from "@/lib/pipeline";
import type { Db, Supplier } from "@/lib/types";

export function passportJson(db: Db, s: Supplier) {
  const { inst, score } = supplierResult(db, s);
  return {
    schema: "carbonlink.passport/v1",
    generatedAt: new Date().toISOString(),
    installation: { operator: s.name, city: s.city, state: s.state, country: "IN" },
    reportingPeriod: { from: inst.periodStart, to: inst.periodEnd, months: inst.months },
    method: "Actual data, simplified CBAM calculation (combustion + process inputs, grid electricity, purchased precursors); mass-based attribution between products",
    factors: { gridEfTCO2PerMWh: db.settings.gridEf, fuels: FUEL_FACTORS },
    products: inst.products.map((p) => ({
      name: p.name,
      cnCode: p.cnCode,
      sector: p.sector,
      productionRoute: ROUTES[s.products.find((x) => x.id === p.productId)?.route ?? ""]?.label ?? null,
      outputTonnes: p.outputTonnes,
      specificEmbeddedEmissions: { direct: p.seeDirect, indirect: p.seeIndirect, unit: "tCO2e/t" },
      usesDefaultValuesForPrecursors: p.usesDefaultPrecursor,
    })),
    dataQuality: score,
    verification: s.verification,
    evidence: s.evidence.map((e) => ({ file: e.fileName, sha256: e.sha256, type: e.data.docType, period: [e.data.periodStart, e.data.periodEnd] })),
  };
}

export async function supplierWorkbook(db: Db, s: Supplier): Promise<Buffer> {
  const { inst, flags, score } = supplierResult(db, s);
  const wb = new ExcelJS.Workbook();
  wb.creator = "CarbonLink";
  wb.created = new Date();
  const head = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  // A. Installation
  const a = wb.addWorksheet("A_Installation");
  a.columns = [{ header: "Field", key: "f", width: 38 }, { header: "Value", key: "v", width: 60 }];
  a.addRows([
    { f: "Operator / installation name", v: s.name },
    { f: "City / State / Country", v: `${s.city}, ${s.state}, India` },
    { f: "Contact", v: `${s.contactName} ${s.phone}` },
    { f: "Reporting period", v: `${inst.periodStart ?? "?"} to ${inst.periodEnd ?? "?"} (${inst.months} months)` },
    { f: "Direct emissions, installation (tCO2)", v: inst.directTotal },
    { f: "  of which combustion", v: inst.directTotal - inst.processEmissions },
    { f: "  of which process inputs (electrodes)", v: inst.processEmissions },
    { f: "Grid electricity (MWh)", v: inst.electricityMWh },
    { f: "Renewable electricity claimed (MWh)", v: inst.renewableMWh },
    { f: "Grid emission factor (tCO2/MWh)", v: db.settings.gridEf },
    { f: "Indirect emissions (tCO2)", v: inst.indirectTotal },
    { f: "Total output (t)", v: inst.outputTonnes },
    { f: "Data quality score / completeness", v: `${score.quality} / ${score.completeness}% (grade ${score.grade})` },
    { f: "Verification", v: s.verification ? `${s.verification.by}, ${s.verification.at}: ${s.verification.statement}` : "Not yet verified" },
  ]);
  head(a);

  // B. Processes / goods with SEE
  const b = wb.addWorksheet("B_Goods_SEE");
  b.columns = [
    { header: "Product", key: "name", width: 28 },
    { header: "CN code", key: "cn", width: 14 },
    { header: "Sector", key: "sector", width: 14 },
    { header: "Production route", key: "route", width: 40 },
    { header: "Output (t)", key: "out", width: 12 },
    { header: "Attributed direct (tCO2)", key: "ad", width: 16 },
    { header: "Precursor direct (tCO2)", key: "pd", width: 16 },
    { header: "SEE direct (tCO2e/t)", key: "sd", width: 16 },
    { header: "SEE indirect (tCO2e/t)", key: "si", width: 16 },
    { header: "SEE priced by CBAM", key: "sp", width: 16 },
    { header: "EU default (priced)", key: "dp", width: 16 },
    { header: "Precursors on defaults?", key: "ud", width: 14 },
  ];
  for (const p of inst.products) {
    const prod = s.products.find((x) => x.id === p.productId);
    b.addRow({ name: p.name, cn: p.cnCode, sector: p.sector ? SECTOR_LABEL[p.sector] : "?", route: ROUTES[prod?.route ?? ""]?.label ?? prod?.route, out: p.outputTonnes, ad: p.attributedDirect, pd: p.precursorDirect, sd: p.seeDirect, si: p.seeIndirect, sp: p.seePriced, dp: p.defaultPriced, ud: p.usesDefaultPrecursor ? "yes" : "no" });
  }
  head(b);

  // C. Purchased precursors
  const c = wb.addWorksheet("C_Precursors");
  c.columns = [
    { header: "For product", key: "p", width: 24 },
    { header: "Precursor", key: "n", width: 24 },
    { header: "CN code", key: "cn", width: 12 },
    { header: "SEE direct", key: "d", width: 12 },
    { header: "SEE indirect", key: "i", width: 12 },
    { header: "Source", key: "s", width: 34 },
  ];
  for (const p of s.products) for (const pc of p.precursors) {
    const linked = pc.source === "passport" ? db.suppliers.find((x) => x.id === pc.linkedSupplierId)?.name : null;
    c.addRow({ p: p.name, n: pc.name, cn: pc.cnCode, d: pc.seeDirect, i: pc.seeIndirect, s: pc.source === "passport" ? `Supplier passport: ${linked ?? "?"}` : pc.source === "default" ? "EU default value" : "Actual (producer data)" });
  }
  head(c);

  // D. Activity data with evidence trail
  const d = wb.addWorksheet("D_Activity_Evidence");
  d.columns = [
    { header: "Row ID", key: "id", width: 10 },
    { header: "Kind", key: "kind", width: 18 },
    { header: "Fuel / material", key: "m", width: 28 },
    { header: "Quantity", key: "q", width: 12 },
    { header: "Unit", key: "u", width: 8 },
    { header: "From", key: "f", width: 12 },
    { header: "To", key: "t", width: 12 },
    { header: "Source document", key: "doc", width: 28 },
    { header: "SHA-256", key: "sha", width: 66 },
    { header: "Quote on document", key: "quote", width: 50 },
    { header: "Read by", key: "o", width: 10 },
    { header: "Confirmed", key: "c", width: 10 },
  ];
  for (const r of s.activity) {
    const ev = s.evidence.find((e) => e.id === r.evidenceId);
    d.addRow({ id: r.id, kind: r.kind, m: r.fuel ? FUEL_FACTORS[r.fuel].label : r.material, q: r.quantity, u: r.unit, f: r.periodStart, t: r.periodEnd, doc: ev?.fileName ?? "(manual entry)", sha: ev?.sha256 ?? "", quote: r.sourceQuote, o: r.origin, c: r.confirmed ? "yes" : "no" });
  }
  head(d);

  // E. Emission factors used
  const e = wb.addWorksheet("E_Factors");
  e.columns = [{ header: "Fuel", key: "f", width: 28 }, { header: "Quantity", key: "q", width: 14 }, { header: "Unit", key: "u", width: 8 }, { header: "Energy (GJ)", key: "gj", width: 14 }, { header: "tCO2", key: "t", width: 12 }, { header: "Factor source", key: "s", width: 70 }];
  for (const f of inst.fuelEmissions) e.addRow({ f: FUEL_FACTORS[f.fuel].label, q: f.quantity, u: f.unit, gj: f.energyGJ, t: f.tco2, s: `${FUEL_FACTORS[f.fuel].source}; EF ${FUEL_FACTORS[f.fuel].efPerTJ} tCO2/TJ` });
  if (inst.processEmissions) e.addRow({ f: "Electrodes / carbon inputs", t: inst.processEmissions, s: `${PROCESS_INPUT_EF_PER_T} tCO2 per t carbon input` });
  head(e);

  // F. Open data-quality flags
  const fl = wb.addWorksheet("F_Flags");
  fl.columns = [{ header: "Rule", key: "r", width: 8 }, { header: "Severity", key: "s", width: 10 }, { header: "Finding", key: "t", width: 70 }, { header: "Detail", key: "d", width: 90 }];
  for (const f of flags) fl.addRow({ r: f.rule, s: f.severity, t: f.title, d: f.detail });
  head(fl);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** One row per supplier product: the CSV an EU importer asks for. */
export function buyerCsv(db: Db): string {
  const lines = [["supplier", "city", "product", "cn_code", "sector", "period_from", "period_to", "see_direct_tco2e_per_t", "see_indirect_tco2e_per_t", "precursors_on_defaults", "quality_score", "verified"].join(",")];
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  for (const s of db.suppliers) {
    const { inst, score } = supplierResult(db, s);
    for (const p of inst.products) {
      if (!p.outputTonnes) continue;
      lines.push([q(s.name), q(s.city), q(p.name), q(p.cnCode), q(p.sector), q(inst.periodStart), q(inst.periodEnd), p.seeDirect, p.seeIndirect, p.usesDefaultPrecursor, score.quality, s.verification ? "yes" : "no"].join(","));
    }
  }
  return lines.join("\n");
}
