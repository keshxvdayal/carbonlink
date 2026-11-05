import { json } from "@/lib/api";
import { blankSupplier } from "@/lib/seed";
import { audit, mutate, readDb } from "@/lib/store";
import { LANGS, type Lang } from "@/lib/types";

export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as Record<string, string> | null;
  const name = b?.name?.trim();
  if (!b || !name) return json({ error: "Supplier name is required." }, 400);
  const language = (LANGS as readonly string[]).includes(b.language) ? (b.language as Lang) : "en";
  const s = blankSupplier({ name: name.slice(0, 120), city: (b.city ?? "").slice(0, 60), state: (b.state ?? "").slice(0, 60), contactName: (b.contactName ?? "").slice(0, 80), phone: (b.phone ?? "").slice(0, 20), language });
  await mutate((db) => {
    db.suppliers.push(s);
    audit(db, "exporter", "supplier_created", s.name, s.id);
  });
  return json({ id: s.id });
}

/** Products other suppliers can link to as precursors (passport links). */
export async function GET() {
  const db = await readDb();
  return json(db.suppliers.flatMap((s) => s.products.map((p) => ({ supplierId: s.id, supplierName: s.name, productId: p.id, productName: p.name }))));
}
