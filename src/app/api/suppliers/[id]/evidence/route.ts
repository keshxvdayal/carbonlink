import { filesFromForm, json, notFound, uploadTo } from "@/lib/api";
import { findSupplier, readDb } from "@/lib/store";

export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!findSupplier(await readDb(), id)) return notFound();
  const form = await request.formData();
  const files = await filesFromForm(form);
  if (files instanceof Response) return files;
  return json({ results: await uploadTo(id, files, "exporter", form.get("offline") === "1") });
}
