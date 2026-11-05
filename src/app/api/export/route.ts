import { buyerCsv } from "@/lib/export";
import { readDb } from "@/lib/store";

/** CSV for EU importers: one row per supplier product. */
export async function GET() {
  const csv = buyerCsv(await readDb());
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="carbonlink-supplier-see.csv"' } });
}
