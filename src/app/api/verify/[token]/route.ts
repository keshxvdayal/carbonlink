import { json, notFound, supplierView } from "@/lib/api";
import { supplierResult } from "@/lib/pipeline";
import { audit, findByToken, mutate, readDb, verifyAuditChain } from "@/lib/store";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const db = await readDb();
  const s = findByToken(db, "verifierToken", (await params).token);
  if (!s) return notFound();
  const { supplier, result, upstream, settings } = supplierView(db, s);
  const safe: Partial<typeof supplier> = { ...supplier };
  delete safe.portalToken;
  return json({ supplier: safe, result, upstream, settings, audit: { chain: verifyAuditChain(db.audit), entries: db.audit.filter((e) => e.supplierId === s.id).reverse() } });
}

type Body = { action: "comment"; author: string; rowId?: string | null; text: string; status?: "query" | "accepted" } | { action: "resolve"; index: number } | { action: "signoff"; by: string; statement: string } | { action: "reopen"; by: string };

export async function POST(request: Request, { params }: Ctx) {
  const token = (await params).token;
  const b = (await request.json().catch(() => null)) as Body | null;
  if (!b) return json({ error: "Expected JSON" }, 400);
  const out = await mutate((db) => {
    const s = findByToken(db, "verifierToken", token);
    if (!s) return null;
    if (b.action === "comment") {
      const text = b.text?.trim().slice(0, 2000);
      const author = b.author?.trim().slice(0, 80) || "Verifier";
      if (!text) return { error: "Comment is empty." };
      s.comments.push({ at: new Date().toISOString(), author, rowId: b.rowId ?? null, text, status: b.status === "accepted" ? "accepted" : "query" });
      audit(db, `verifier:${author}`, b.status === "accepted" ? "value_accepted" : "query_raised", `${b.rowId ?? "general"}: ${text}`, s.id);
    } else if (b.action === "resolve") {
      const c = s.comments[b.index];
      if (!c) return { error: "Unknown comment" };
      c.status = "resolved";
      audit(db, "verifier", "query_resolved", c.text, s.id);
    } else if (b.action === "signoff") {
      const by = b.by?.trim().slice(0, 120);
      const statement = b.statement?.trim().slice(0, 2000);
      if (!by || !statement) return { error: "Name and statement are required." };
      if (s.comments.some((c) => c.status === "query")) return { error: "Resolve all open queries before signing off." };
      const critical = supplierResult(db, s).flags.filter((f) => f.severity === "critical");
      if (critical.length) return { error: `Critical data flags are still open: ${critical.map((f) => f.title).join("; ")}. The exporter must fix the data first.` };
      s.verification = { by, at: new Date().toISOString(), statement };
      s.status = "verified";
      audit(db, `verifier:${by}`, "verified", statement, s.id);
    } else if (b.action === "reopen") {
      s.verification = null;
      s.status = "submitted";
      audit(db, `verifier:${b.by || "verifier"}`, "verification_reopened", "", s.id);
    }
    return { ok: true };
  });
  if (!out) return notFound();
  if ("error" in out) return json(out, 400);
  return json(out);
}
