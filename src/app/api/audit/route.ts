import { connection } from "next/server";
import { json } from "@/lib/api";
import { readDb, verifyAuditChain } from "@/lib/store";

export async function GET(request: Request) {
  await connection();
  const db = await readDb();
  const supplierId = new URL(request.url).searchParams.get("supplier");
  const entries = supplierId ? db.audit.filter((e) => e.supplierId === supplierId) : db.audit;
  return json({ chain: verifyAuditChain(db.audit), entries: entries.slice(-300).reverse() });
}
