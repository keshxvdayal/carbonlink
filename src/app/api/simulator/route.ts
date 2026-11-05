import { connection } from "next/server";
import { json } from "@/lib/api";
import { supplierResult } from "@/lib/pipeline";
import { readDb } from "@/lib/store";

/** Every supplier product with a computed footprint, for the simulator. */
export async function GET() {
  await connection();
  const db = await readDb();
  const products = db.suppliers.flatMap((s) => {
    const { inst } = supplierResult(db, s);
    return inst.products
      .filter((p) => p.outputTonnes > 0 && p.sector && p.defaultPriced !== null)
      .map((p) => ({
        key: `${s.id}:${p.productId}`,
        supplierId: s.id,
        productId: p.productId,
        label: `${s.name}: ${p.name}`,
        sector: p.sector!,
        seeActual: p.seePriced,
        seeDefault: p.defaultPriced!,
        tonnes: s.products.find((x) => x.id === p.productId)?.euTonnesPerYear ?? 0,
      }));
  });
  return json({ settings: db.settings, products });
}
