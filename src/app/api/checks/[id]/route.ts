import { scoreAndStatus } from "@/lib/pipeline";
import { deleteCheck, getCheck, saveCheck } from "@/lib/store";
import type { FindingStatus } from "@/lib/types";


type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const check = await getCheck((await params).id);
  return check ? Response.json(check) : Response.json({ error: "Not found" }, { status: 404 });
}

const STATUSES: FindingStatus[] = ["open", "resolved", "false_positive"];

/** Reviewer action on one finding: resolve, mark false positive, or reopen. */
export async function PATCH(request: Request, { params }: Ctx) {
  const check = await getCheck((await params).id);
  if (!check) return Response.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { findingId?: string; status?: FindingStatus; note?: string } | null;
  const finding = check.findings.find((f) => f.id === body?.findingId);
  if (!body || !finding || !body.status || !STATUSES.includes(body.status))
    return Response.json({ error: "Expected { findingId, status: open|resolved|false_positive, note? }" }, { status: 400 });

  const note = body.note?.trim().slice(0, 1000) || undefined;
  finding.status = body.status;
  finding.reviewerNote = note;
  check.audit.push({ at: new Date().toISOString(), action: `finding_${body.status}`, detail: `${finding.id} ${finding.title}${note ? `: ${note}` : ""}` });
  Object.assign(check, scoreAndStatus(check.findings));
  await saveCheck(check);
  return Response.json(check);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  await deleteCheck((await params).id);
  return new Response(null, { status: 204 });
}
