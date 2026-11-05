import { json, notFound } from "@/lib/api";
import { passportJson } from "@/lib/export";
import { findByToken, readDb } from "@/lib/store";

/** Public, read-only passport: per-product SEE + evidence hashes, no documents. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const db = await readDb();
  const s = findByToken(db, "passportToken", (await params).token);
  if (!s || (s.status !== "submitted" && s.status !== "verified")) return notFound();
  return json(passportJson(db, s));
}
