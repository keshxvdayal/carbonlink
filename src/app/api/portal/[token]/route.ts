import { filesFromForm, json, notFound, portalView, uploadTo } from "@/lib/api";
import { findByToken, readDb } from "@/lib/store";

export const maxDuration = 300;
type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const db = await readDb();
  const s = findByToken(db, "portalToken", (await params).token);
  return s ? json(portalView(db, s)) : notFound();
}

/** Supplier uploads (photos of bills etc.). */
export async function POST(request: Request, { params }: Ctx) {
  const token = (await params).token;
  const s = findByToken(await readDb(), "portalToken", token);
  if (!s) return notFound();
  if (s.status === "verified") return json({ error: "Your data is verified and locked. Ask your buyer to reopen it." }, 409);
  const files = await filesFromForm(await request.formData());
  if (files instanceof Response) return files;
  const results = await uploadTo(s.id, files, "supplier");
  const db = await readDb();
  return json({ results, view: portalView(db, findByToken(db, "portalToken", token)!) });
}
