import { connection } from "next/server";
import { json } from "@/lib/api";
import { supplierResult } from "@/lib/pipeline";
import { simulateYear } from "@/lib/simulator";
import { readDb } from "@/lib/store";

export async function GET() {
  await connection();
  const db = await readDb();
  const year = db.settings.reportingYear;
  const suppliers = db.suppliers.map((s) => {
    const { inst, flags, score } = supplierResult(db, s);
    let savingEur = 0;
    for (const p of inst.products) {
      const prod = s.products.find((x) => x.id === p.productId);
      if (!p.sector || p.defaultPriced === null || !p.outputTonnes || !prod) continue;
      // If actuals came out above the default, the importer would simply use the default: no saving, no loss.
      savingEur += Math.max(0, simulateYear({ sector: p.sector, tonnes: prod.euTonnesPerYear, seeActual: p.seePriced, seeDefault: p.defaultPriced, etsPriceEur: db.settings.etsPriceEur, originCarbonPriceEur: db.settings.originCarbonPriceEur }, year).savingEur);
    }
    return {
      id: s.id, name: s.name, city: s.city, state: s.state, status: s.status, language: s.language, phone: s.phone, portalToken: s.portalToken,
      products: inst.products.map((p) => ({ name: p.name, cnCode: p.cnCode, seePriced: p.seePriced, defaultPriced: p.defaultPriced, outputTonnes: p.outputTonnes })),
      months: inst.months, evidenceCount: s.evidence.length, score,
      counts: { critical: flags.filter((f) => f.severity === "critical").length, major: flags.filter((f) => f.severity === "major").length, minor: flags.filter((f) => f.severity === "minor").length },
      savingEur,
    };
  });
  return json({ settings: db.settings, suppliers });
}
