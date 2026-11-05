import { applyRowPatch, json, notFound, portalView, type RowPatch } from "@/lib/api";
import { audit, findByToken, mutate } from "@/lib/store";

/** Supplier confirms or corrects a value read from their document. */
export async function PATCH(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const b = (await request.json().catch(() => null)) as (RowPatch & { rowId?: string }) | null;
  if (!b?.rowId) return json({ error: "Expected { rowId, … }" }, 400);
  const out = await mutate((db) => {
    const s = findByToken(db, "portalToken", token);
    if (!s) return null;
    if (s.status === "verified") return { error: "Verified data is locked." };
    const row = s.activity.find((r) => r.id === b.rowId);
    if (!row) return { error: "Unknown row" };
    const patch = b;
    // Suppliers may only correct quantity/unit/dates and confirm; mapping stays with the exporter.
    const res = applyRowPatch(s, row, { quantity: patch.quantity, unit: patch.unit, periodStart: patch.periodStart, periodEnd: patch.periodEnd, confirmed: patch.confirmed });
    if ("error" in res) return { error: res.error };
    if (res.changes) audit(db, "supplier", "row_updated", `${row.id}: ${res.changes}`, s.id);
    return portalView(db, s);
  });
  if (!out) return notFound();
  if ("error" in out) return json(out, 400);
  return json(out);
}
