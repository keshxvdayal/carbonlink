import { aiEnabled, extractWithClaude, type UploadedFile } from "@/lib/extract/claude";
import { extractHeuristic } from "@/lib/extract/heuristic";
import { computeInstallation, productForRow, type PassportResolver } from "@/lib/calc";
import { runFlags, scorecard, type Scorecard } from "@/lib/flags";
import { newId, saveEvidenceFile } from "@/lib/store";
import type { ActivityRow, Db, Evidence, ExtractedDoc, Flag, InstallationResult, Supplier } from "@/lib/types";

async function pdfText(data: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

export async function extract(file: UploadedFile, opts: { forceOffline?: boolean } = {}): Promise<{ data: ExtractedDoc; by: Evidence["extractedBy"] }> {
  if (aiEnabled() && !opts.forceOffline) return { data: await extractWithClaude(file), by: "claude" };
  let text: string;
  if (file.mimeType === "application/pdf") text = await pdfText(file.data);
  else if (file.mimeType.startsWith("text/")) text = file.data.toString("utf8");
  else throw new Error(`${file.name}: scans and photos need AI mode. Set ANTHROPIC_API_KEY, or upload a text/PDF version.`);
  return { data: extractHeuristic(text), by: "offline" };
}

/** Turn one extracted document into evidence + activity rows on the supplier. */
export function attachExtraction(s: Supplier, file: Omit<Evidence, "id" | "data" | "extractedBy">, data: ExtractedDoc, by: Evidence["extractedBy"]): { evidence: Evidence; rows: ActivityRow[] } {
  const evidence: Evidence = { ...file, id: newId(), data, extractedBy: by };
  const lowSet = data.lowConfidenceFields.map((f) => f.toLowerCase());
  const rows: ActivityRow[] = data.lines.map((l) => {
    const row: ActivityRow = {
      id: newId(),
      kind: l.kind,
      fuel: l.kind === "fuel" ? l.fuel : null,
      material: l.material,
      productId: null,
      quantity: l.quantity,
      unit: l.unit,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd ?? data.periodStart,
      evidenceId: evidence.id,
      sourceQuote: l.sourceQuote,
      origin: by === "claude" ? "ai" : by === "offline" ? "offline" : "manual",
      lowConfidence: lowSet.some((f) => f && ((l.material ?? "").toLowerCase().includes(f) || f.includes(l.kind) || (l.material && f.includes(l.material.toLowerCase())))),
      confirmed: false,
    };
    if (row.kind === "production" || row.kind === "precursor") row.productId = productForRow(s, row);
    return row;
  });
  s.evidence.push(evidence);
  s.activity.push(...rows);
  return { evidence, rows };
}

export async function ingest(s: Supplier, upload: UploadedFile, by: Evidence["uploadedBy"], opts: { forceOffline?: boolean } = {}) {
  const sha = await saveEvidenceFile(upload.data);
  const { data, by: extractedBy } = await extract(upload, opts);
  return attachExtraction(s, { fileName: upload.name, mimeType: upload.mimeType, sha256: sha, size: upload.data.length, uploadedAt: new Date().toISOString(), uploadedBy: by }, data, extractedBy);
}

/* ------------------------------------------------------------------ *
 * Results for one supplier (with multi-tier passport resolution)     *
 * ------------------------------------------------------------------ */
export type SupplierResult = { inst: InstallationResult; flags: Flag[]; score: Scorecard };

export function makeResolver(db: Db, depth = 0, seen = new Set<string>()): PassportResolver {
  return (supplierId, productId) => {
    if (depth > 4 || seen.has(supplierId)) return null; // guard against cycles
    const up = db.suppliers.find((x) => x.id === supplierId);
    if (!up) return null;
    const inst = computeInstallation(up, db.settings, makeResolver(db, depth + 1, new Set([...seen, supplierId])));
    const p = inst.products.find((x) => x.productId === productId);
    return p && p.outputTonnes > 0 ? { seeDirect: p.seeDirect, seeIndirect: p.seeIndirect } : null;
  };
}

export function supplierResult(db: Db, s: Supplier): SupplierResult {
  const inst = computeInstallation(s, db.settings, makeResolver(db, 0, new Set([s.id])));
  const flags = runFlags(s, inst);
  return { inst, flags, score: scorecard(s, inst, flags) };
}
