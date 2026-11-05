import { randomUUID } from "crypto";
import { aiEnabled, classifyHsWithClaude, extractWithClaude, type UploadedFile } from "@/lib/extract/claude";
import { extractHeuristic } from "@/lib/extract/heuristic";
import { hs6, lookupHs, suggestFromReference } from "@/lib/hs";
import { runRules } from "@/lib/rules";
import type { CheckResult, CheckStatus, Finding, HsSuggestion, Severity, SourceDoc } from "@/lib/types";

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 30, major: 12, minor: 4, info: 0 };
export const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "info"];

async function pdfText(data: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

async function extractOne(file: UploadedFile, useAi: boolean): Promise<SourceDoc> {
  const id = randomUUID().slice(0, 8);
  if (useAi) return { id, fileName: file.name, extractedBy: "claude", data: await extractWithClaude(file) };

  let text: string;
  if (file.mimeType === "application/pdf") text = await pdfText(file.data);
  else if (file.mimeType.startsWith("image/")) throw new Error(`${file.name}: images need AI mode. Set ANTHROPIC_API_KEY to read scans and photos.`);
  else text = file.data.toString("utf8");
  return { id, fileName: file.name, extractedBy: "heuristic", data: extractHeuristic(text) };
}

async function buildHsSuggestions(docs: SourceDoc[], useAi: boolean): Promise<HsSuggestion[]> {
  // Use the invoice's lines as the canonical item list; fall back to any doc with items.
  const source = docs.find((d) => d.data.docType === "commercial_invoice" && d.data.lineItems.length) ?? docs.find((d) => d.data.lineItems.length);
  if (!source) return [];
  const items = source.data.lineItems.map((li) => ({ description: li.description, declared: li.hsCode }));

  const ai = useAi ? await classifyHsWithClaude(items).catch(() => []) : [];
  return items.map((it, i): HsSuggestion => {
    const a = ai.find((s) => s.index === i);
    if (a) {
      const sugg = a.suggestedHs.replace(/\D/g, "");
      return { description: it.description, declared: it.declared, suggested: sugg, suggestedDescription: a.suggestedDescription, confidence: a.confidence, source: "claude", rationale: a.rationale, matchesDeclared: it.declared ? hs6(it.declared) === hs6(sugg) : null };
    }
    const ref = suggestFromReference(it.description);
    if (!ref) {
      const known = it.declared ? lookupHs(it.declared) : undefined;
      return { description: it.description, declared: it.declared, suggested: null, suggestedDescription: known?.description ?? null, confidence: "low", source: "reference_table", rationale: "No match in the offline reference table. Enable AI mode or classify manually.", matchesDeclared: null };
    }
    return { description: it.description, declared: it.declared, suggested: ref.entry.code, suggestedDescription: ref.entry.description, confidence: ref.score >= 7 ? "medium" : "low", source: "reference_table", rationale: "Keyword match against the offline reference table (6-digit level). Confirm against the ITC-HS schedule.", matchesDeclared: it.declared ? hs6(it.declared) === ref.entry.code : null };
  });
}

function hsFindings(sugg: HsSuggestion[]): Omit<Finding, "id" | "status">[] {
  return sugg
    .filter((s) => s.matchesDeclared === false && s.confidence !== "low")
    .map((s) => ({
      ruleId: "HS-010",
      severity: s.confidence === "high" ? ("major" as const) : ("minor" as const),
      category: "hs_code" as const,
      title: `Declared HS ${s.declared} may be wrong for "${s.description}"`,
      detail: `Suggested ${s.suggested} (${s.suggestedDescription}). ${s.rationale}`,
      fix: "Confirm the classification. A wrong HS code changes duty, incentive eligibility and can trigger a customs query.",
    }));
}

export function scoreAndStatus(findings: Finding[]): Pick<CheckResult, "riskScore" | "riskLevel" | "status"> {
  const open = findings.filter((f) => f.status === "open");
  const riskScore = Math.min(100, open.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0));
  const riskLevel = riskScore >= 50 ? "high" : riskScore >= 20 ? "medium" : "low";
  let status: CheckStatus = "clear";
  if (open.some((f) => f.severity === "critical" || f.severity === "major")) status = "issues_found";
  else if (open.length) status = "needs_review";
  return { riskScore, riskLevel, status };
}

export async function runCheck(name: string, files: UploadedFile[], opts: { forceOffline?: boolean } = {}): Promise<CheckResult> {
  const useAi = aiEnabled() && !opts.forceOffline;
  const docs = await Promise.all(files.map((f) => extractOne(f, useAi)));
  const hsSuggestions = await buildHsSuggestions(docs, useAi);

  const findings: Finding[] = [...runRules(docs), ...hsFindings(hsSuggestions)]
    .map((f, i) => ({ ...f, id: `F${String(i + 1).padStart(3, "0")}`, status: "open" as const }))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  const now = new Date().toISOString();
  return {
    id: randomUUID().slice(0, 12),
    name,
    createdAt: now,
    docs,
    findings,
    hsSuggestions,
    mode: useAi ? "ai" : "offline",
    audit: [{ at: now, action: "check_created", detail: `${docs.length} document(s), ${findings.length} finding(s), ${useAi ? "AI" : "offline"} extraction` }],
    ...scoreAndStatus(findings),
  };
}
