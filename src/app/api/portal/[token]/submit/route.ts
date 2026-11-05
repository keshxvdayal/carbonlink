import { json, notFound, portalView } from "@/lib/api";
import { audit, findByToken, mutate } from "@/lib/store";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const out = await mutate((db) => {
    const s = findByToken(db, "portalToken", token);
    if (!s) return null;
    if (!s.evidence.length) return { error: "Upload at least one document first." };
    if (s.status !== "verified") s.status = "submitted";
    s.submittedAt = new Date().toISOString();
    audit(db, "supplier", "submitted", `${s.activity.filter((r) => r.confirmed).length}/${s.activity.length} values confirmed`, s.id);
    return portalView(db, s);
  });
  if (!out) return notFound();
  if ("error" in out) return json(out, 400);
  return json(out);
}
