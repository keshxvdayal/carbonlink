import { notFound } from "@/lib/api";
import { readDb, readEvidenceFile } from "@/lib/store";

/** Original evidence file. Requires the supplier's verifier or portal token, or the exporter view (no auth in the MVP). */
export async function GET(request: Request, { params }: { params: Promise<{ sha: string }> }) {
  const sha = (await params).sha;
  const token = new URL(request.url).searchParams.get("t");
  const db = await readDb();
  const owner = db.suppliers.find((s) => s.evidence.some((e) => e.sha256 === sha));
  if (!owner) return notFound();
  if (token && token !== owner.verifierToken && token !== owner.portalToken) return notFound();
  const ev = owner.evidence.find((e) => e.sha256 === sha)!;
  const data = await readEvidenceFile(sha);
  if (!data) return notFound();
  return new Response(new Uint8Array(data), { headers: { "content-type": ev.mimeType.startsWith("text/") ? "text/plain; charset=utf-8" : ev.mimeType, "content-disposition": `inline; filename="${ev.fileName.replace(/"/g, "")}"`, "x-content-type-options": "nosniff" } });
}
