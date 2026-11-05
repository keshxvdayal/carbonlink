import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { productForRow } from "@/lib/calc";
import { ExtractionError, type UploadedFile } from "@/lib/extract/claude";
import { ingest, supplierResult } from "@/lib/pipeline";
import { suggestions } from "@/lib/suggestions";
import { audit, mutate, newId } from "@/lib/store";
import { ACTIVITY_KINDS, FUELS, UNITS, type ActivityRow, type Db, type Supplier } from "@/lib/types";

export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 20;

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".txt": "text/plain",
  ".csv": "text/plain",
};

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const notFound = () => json({ error: "Not found" }, 404);

export async function filesFromForm(form: FormData): Promise<UploadedFile[] | Response> {
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!uploads.length) return json({ error: "Choose at least one file." }, 400);
  if (uploads.length > MAX_FILES) return json({ error: `Upload at most ${MAX_FILES} files at a time.` }, 400);
  const out: UploadedFile[] = [];
  for (const f of uploads) {
    if (f.size > MAX_BYTES) return json({ error: `${f.name} is larger than 20 MB.` }, 400);
    const ext = path.extname(f.name).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] ?? (f.type || "");
    if (mimeType === "image/heic") return json({ error: `${f.name}: HEIC photos aren't supported yet. In iPhone Settings → Camera → Formats choose "Most Compatible", or upload a screenshot.` }, 400);
    if (!Object.values(MIME_BY_EXT).includes(mimeType)) return json({ error: `${f.name}: use PDF, JPG, PNG, WEBP or TXT.` }, 400);
    out.push({ name: f.name.slice(0, 120), mimeType, data: Buffer.from(await f.arrayBuffer()) });
  }
  return out;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ExtractionError) return json({ error: err.message }, 422);
  if (err instanceof Anthropic.AuthenticationError) return json({ error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." }, 502);
  if (err instanceof Anthropic.RateLimitError) return json({ error: "AI rate limit reached. Try again in a minute." }, 429);
  if (err instanceof Anthropic.APIError) return json({ error: `AI service error (${err.status ?? "network"}). Try again.` }, 502);
  if (err instanceof Error) return json({ error: err.message }, 400);
  throw err;
}

/** Upload + extract outside the DB lock (AI calls are slow), then attach under the lock. */
export async function uploadTo(supplierId: string, files: UploadedFile[], by: "supplier" | "exporter", forceOffline = false) {
  const results: { name: string; rows: number; error?: string }[] = [];
  for (const f of files) {
    try {
      // Extraction runs on a scratch copy so a slow AI call never holds the write lock.
      const scratch = { products: [], activity: [], evidence: [] } as unknown as Supplier;
      const { evidence, rows } = await ingest(scratch, f, by, { forceOffline });
      await mutate((db) => {
        const s = db.suppliers.find((x) => x.id === supplierId);
        if (!s) throw new Error("Supplier not found");
        s.evidence.push(evidence);
        // product matching needs the real supplier's products
        for (const r of rows) if (r.kind === "production" || r.kind === "precursor") r.productId = productForRow(s, r);
        s.activity.push(...rows);
        if (s.status === "invited") s.status = "collecting";
        audit(db, by, "evidence_uploaded", `${f.name} sha256=${evidence.sha256.slice(0, 16)}… ${rows.length} value(s) read by ${evidence.extractedBy}`, s.id);
      });
      results.push({ name: f.name, rows: rows.length });
    } catch (err) {
      const res = errorResponse(err);
      results.push({ name: f.name, rows: 0, error: ((await res.json()) as { error: string }).error });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ *
 * Activity-row edits (shared by exporter and supplier portal)        *
 * ------------------------------------------------------------------ */
export type RowPatch = Partial<Pick<ActivityRow, "kind" | "fuel" | "material" | "productId" | "quantity" | "unit" | "periodStart" | "periodEnd" | "confirmed">>;

export function applyRowPatch(s: Supplier, row: ActivityRow, patch: RowPatch): { error: string } | { changes: string } {
  const changes: string[] = [];
  if (patch.kind !== undefined) {
    if (!ACTIVITY_KINDS.includes(patch.kind)) return { error: "invalid kind" };
    row.kind = patch.kind;
    changes.push(`kind=${patch.kind}`);
  }
  if (patch.fuel !== undefined) {
    if (patch.fuel !== null && !FUELS.includes(patch.fuel)) return { error: "invalid fuel" };
    row.fuel = patch.fuel;
  }
  if (patch.unit !== undefined) {
    if (!UNITS.includes(patch.unit)) return { error: "invalid unit" };
    if (patch.unit !== row.unit) changes.push(`unit ${row.unit}→${patch.unit}`);
    row.unit = patch.unit;
  }
  if (patch.quantity !== undefined) {
    const q = Number(patch.quantity);
    if (!Number.isFinite(q) || q < 0) return { error: "quantity must be a positive number" };
    if (q !== row.quantity) changes.push(`quantity ${row.quantity}→${q}`);
    row.quantity = q;
  }
  if (patch.material !== undefined) row.material = patch.material?.slice(0, 120) ?? null;
  if (patch.productId !== undefined) {
    if (patch.productId !== null && !s.products.some((p) => p.id === patch.productId)) return { error: "unknown product" };
    row.productId = patch.productId;
    changes.push(`product=${patch.productId}`);
  }
  for (const k of ["periodStart", "periodEnd"] as const) {
    if (patch[k] !== undefined) {
      if (patch[k] !== null && !/^\d{4}-\d{2}-\d{2}$/.test(patch[k]!)) return { error: `${k} must be YYYY-MM-DD` };
      row[k] = patch[k]!;
    }
  }
  if (patch.confirmed !== undefined) {
    row.confirmed = Boolean(patch.confirmed);
    changes.push(row.confirmed ? "confirmed" : "unconfirmed");
  }
  if (changes.some((c) => c.startsWith("quantity") || c.startsWith("unit"))) row.lowConfidence = false;
  return { changes: changes.join(", ") };
}

export function manualRow(input: RowPatch): ActivityRow {
  return {
    id: newId(),
    kind: input.kind ?? "electricity",
    fuel: input.fuel ?? null,
    material: input.material ?? null,
    productId: input.productId ?? null,
    quantity: Number(input.quantity ?? 0),
    unit: input.unit ?? "kWh",
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? input.periodStart ?? null,
    evidenceId: null,
    sourceQuote: null,
    origin: "manual",
    lowConfidence: false,
    confirmed: false,
  };
}

/* ------------------------------------------------------------------ *
 * Views                                                               *
 * ------------------------------------------------------------------ */
export function supplierView(db: Db, s: Supplier) {
  const result = supplierResult(db, s);
  const upstream = s.products.flatMap((p) => p.precursors.filter((pc) => pc.linkedSupplierId)).map((pc) => {
    const up = db.suppliers.find((x) => x.id === pc.linkedSupplierId);
    return { precursorId: pc.id, supplierName: up?.name ?? "?", productName: up?.products.find((p) => p.id === pc.linkedProductId)?.name ?? "?" };
  });
  return { supplier: s, result, upstream, settings: db.settings, suggestions: suggestions(s, result.inst) };
}

/** What a supplier sees on their own portal: no tokens, comments or other suppliers. */
export function portalView(db: Db, s: Supplier) {
  const { result } = supplierView(db, s);
  return {
    buyer: db.settings.exporterName,
    supplier: { name: s.name, city: s.city, language: s.language, status: s.status, products: s.products.map((p) => ({ id: p.id, name: p.name, cnCode: p.cnCode })), evidence: s.evidence.map((e) => ({ id: e.id, fileName: e.fileName, docType: e.data.docType, uploadedAt: e.uploadedAt, periodStart: e.data.periodStart, periodEnd: e.data.periodEnd })), activity: s.activity, passportToken: s.status === "submitted" || s.status === "verified" ? s.passportToken : null },
    result: { months: result.inst.months, periodStart: result.inst.periodStart, periodEnd: result.inst.periodEnd, score: result.score, products: result.inst.products.map((p) => ({ name: p.name, seeDirect: p.seeDirect, outputTonnes: p.outputTonnes })) },
  };
}
