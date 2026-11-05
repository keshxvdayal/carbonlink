import { notFound } from "@/lib/api";
import { passportJson, supplierWorkbook } from "@/lib/export";
import { findSupplier, readDb } from "@/lib/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await readDb();
  const s = findSupplier(db, (await params).id);
  if (!s) return notFound();
  const slug = s.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  if (new URL(request.url).searchParams.get("format") === "json") {
    return new Response(JSON.stringify(passportJson(db, s), null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${slug}-passport.json"` } });
  }
  const buf = await supplierWorkbook(db, s);
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${slug}-cbam-data.xlsx"` },
  });
}
