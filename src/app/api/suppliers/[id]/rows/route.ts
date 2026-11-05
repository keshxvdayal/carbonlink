import { applyRowPatch, json, manualRow, notFound, supplierView, type RowPatch } from "@/lib/api";
import { audit, findSupplier, mutate } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };
type Body = RowPatch & { rowId?: string; rowIds?: string[] };

/** Edit or confirm rows. { rowId, ...patch } or { rowIds: [...], confirmed: true } for bulk confirm. */
export async function PATCH(request: Request, { params }: Ctx) {
  const id = (await params).id;
  const b = (await request.json().catch(() => null)) as Body | null;
  if (!b) return json({ error: "Expected JSON" }, 400);
  const out = await mutate((db) => {
    const s = findSupplier(db, id);
    if (!s) return null;
    const ids = b.rowIds ?? (b.rowId ? [b.rowId] : []);
    const patch: RowPatch = { kind: b.kind, fuel: b.fuel, material: b.material, productId: b.productId, quantity: b.quantity, unit: b.unit, periodStart: b.periodStart, periodEnd: b.periodEnd, confirmed: b.confirmed };
    for (const rid of ids) {
      const row = s.activity.find((r) => r.id === rid);
      if (!row) return { error: `Unknown row ${rid}` };
      const res = applyRowPatch(s, row, patch);
      if ("error" in res) return { error: res.error };
      if (res.changes) audit(db, "exporter", "row_updated", `${row.id}: ${res.changes}`, s.id);
    }
    return supplierView(db, s);
  });
  if (!out) return notFound();
  if ("error" in out) return json(out, 400);
  return json(out);
}

export async function POST(request: Request, { params }: Ctx) {
  const id = (await params).id;
  const b = (await request.json().catch(() => null)) as RowPatch | null;
  if (!b || !(Number(b.quantity) >= 0)) return json({ error: "Expected { kind, quantity, unit, … }" }, 400);
  const out = await mutate((db) => {
    const s = findSupplier(db, id);
    if (!s) return null;
    const row = manualRow(b);
    s.activity.push(row);
    audit(db, "exporter", "row_added", `${row.id}: ${row.kind} ${row.quantity} ${row.unit} (manual, no evidence)`, s.id);
    return supplierView(db, s);
  });
  return out ? json(out) : notFound();
}

export async function DELETE(request: Request, { params }: Ctx) {
  const id = (await params).id;
  const rowId = new URL(request.url).searchParams.get("row");
  const out = await mutate((db) => {
    const s = findSupplier(db, id);
    if (!s) return null;
    const row = s.activity.find((r) => r.id === rowId);
    if (row) {
      s.activity = s.activity.filter((r) => r.id !== rowId);
      audit(db, "exporter", "row_deleted", `${row.id}: ${row.kind} ${row.quantity} ${row.unit}`, s.id);
    }
    return supplierView(db, s);
  });
  return out ? json(out) : notFound();
}
