import { json, notFound, supplierView } from "@/lib/api";
import { ROUTES } from "@/lib/factors";
import { audit, findSupplier, mutate, newId, readDb } from "@/lib/store";
import { LANGS, type Product, type Supplier, type SupplierStatus } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const db = await readDb();
  const s = findSupplier(db, (await params).id);
  return s ? json(supplierView(db, s)) : notFound();
}

type Patch = Partial<Pick<Supplier, "name" | "city" | "state" | "contactName" | "phone" | "language">> & { status?: SupplierStatus; products?: Product[] };

export async function PATCH(request: Request, { params }: Ctx) {
  const id = (await params).id;
  const b = (await request.json().catch(() => null)) as Patch | null;
  if (!b) return json({ error: "Expected JSON" }, 400);
  try {
    const out = await mutate((db) => {
      const s = findSupplier(db, id);
      if (!s) return null;
      for (const k of ["name", "city", "state", "contactName", "phone"] as const) if (typeof b[k] === "string") s[k] = b[k]!.slice(0, 120);
      if (b.language && LANGS.includes(b.language)) s.language = b.language;
      if (b.status && ["invited", "collecting", "submitted", "verified"].includes(b.status)) s.status = b.status;
      if (Array.isArray(b.products)) {
        s.products = b.products.map((p) => {
          if (!p.name?.trim() || !p.cnCode?.trim()) throw new Error("Each product needs a name and CN code.");
          if (!ROUTES[p.route]) throw new Error(`Unknown production route ${p.route}`);
          return {
            id: p.id || newId(),
            name: p.name.trim().slice(0, 80),
            cnCode: p.cnCode.trim().slice(0, 14),
            route: p.route,
            euTonnesPerYear: Math.max(0, Number(p.euTonnesPerYear) || 0),
            precursors: (p.precursors ?? []).map((pc) => {
              const linked = pc.source === "passport" && pc.linkedSupplierId && db.suppliers.some((x) => x.id === pc.linkedSupplierId && x.id !== s.id);
              return {
                id: pc.id || newId(),
                name: (pc.name ?? "").slice(0, 80),
                cnCode: (pc.cnCode ?? "").slice(0, 14),
                seeDirect: Math.max(0, Number(pc.seeDirect) || 0),
                seeIndirect: Math.max(0, Number(pc.seeIndirect) || 0),
                source: linked ? "passport" : pc.source === "actual" ? "actual" : "default",
                ...(linked ? { linkedSupplierId: pc.linkedSupplierId, linkedProductId: pc.linkedProductId } : {}),
              };
            }),
          };
        });
      }
      audit(db, "exporter", "supplier_updated", `${s.name}: ${Object.keys(b).join(", ")}`, s.id);
      return supplierView(db, s);
    });
    return out ? json(out) : notFound();
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = (await params).id;
  await mutate((db) => {
    const s = findSupplier(db, id);
    if (!s) return;
    db.suppliers = db.suppliers.filter((x) => x.id !== id);
    audit(db, "exporter", "supplier_deleted", s.name, id);
  });
  return new Response(null, { status: 204 });
}
