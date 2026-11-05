import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ExtractedDocSchema, type ExtractedDoc } from "@/lib/types";

export const MODEL = process.env.TRADECHECK_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** AI mode is on when an Anthropic credential is configured. */
export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

// Server-side fallback: if the model declines for policy reasons, the API
// re-runs the request on Anthropic's recommended substitute model.
const FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

const EXTRACTION_SYSTEM = `You extract data from international trade documents (commercial invoices, packing lists, bills of lading, certificates of origin, Indian shipping bills, letters of credit) for a pre-filing compliance check.

Rules:
- Copy values exactly as printed. Do not correct, infer or "fix" anything: discrepancies between documents are what the downstream checker is looking for, so a silently corrected value hides a real error.
- Use null for any field not present on this document. Never fill a field from general knowledge.
- Convert dates to YYYY-MM-DD. Convert weights to kilograms. Numbers without thousands separators.
- documentNumber is this document's own number. invoiceNumberRef is the commercial invoice number the document refers to (for an invoice, its own number).
- For a letter of credit: exporter = beneficiary, consignee = applicant, totalValue = credit amount.
- HS codes: digits only, as printed.
- List in lowConfidenceFields every field you could not read clearly (blurred, handwritten, cut off, ambiguous) or had to choose between conflicting values on the same page.`;

export type UploadedFile = { name: string; mimeType: string; data: Buffer };

function contentFor(file: UploadedFile): Anthropic.Beta.BetaContentBlockParam {
  if (file.mimeType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data.toString("base64") } };
  }
  if (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.mimeType)) {
    return {
      type: "image",
      source: { type: "base64", media_type: file.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: file.data.toString("base64") },
    };
  }
  return { type: "text", text: `<document name="${file.name}">\n${file.data.toString("utf8")}\n</document>` };
}

export class ExtractionError extends Error {}

export async function extractWithClaude(file: UploadedFile): Promise<ExtractedDoc> {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(ExtractedDocSchema) },
    system: EXTRACTION_SYSTEM,
    messages: [
      {
        role: "user",
        content: [contentFor(file), { type: "text", text: `Extract the fields from "${file.name}".` }],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new ExtractionError(`The model declined to process ${file.name}.`);
  if (response.stop_reason === "max_tokens") throw new ExtractionError(`${file.name} is too long to extract in one pass.`);
  if (!response.parsed_output) throw new ExtractionError(`Could not parse extraction output for ${file.name}.`);
  return response.parsed_output;
}

const HsBatchSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      suggestedHs: z.string().describe("Most likely HS code, 6 to 8 digits, digits only"),
      suggestedDescription: z.string().describe("Official heading/subheading description"),
      confidence: z.enum(["high", "medium", "low"]),
      rationale: z.string().describe("One or two sentences citing the classification rule or material/construction that decides it"),
    }),
  ),
});

export type AiHsSuggestion = z.infer<typeof HsBatchSchema>["items"][number];

export async function classifyHsWithClaude(
  items: { description: string; declared: string | null }[],
): Promise<AiHsSuggestion[]> {
  if (items.length === 0) return [];
  const list = items.map((it, i) => `${i}. "${it.description}" (declared HS: ${it.declared ?? "none"})`).join("\n");
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "high", format: betaZodOutputFormat(HsBatchSchema) },
    system:
      "You are a customs classification specialist for Indian exports. Classify each goods description under the Harmonized System using the General Rules of Interpretation. Give the 8-digit Indian ITC-HS code only when the description is specific enough to decide it; otherwise give the 6-digit subheading. Judge the description on its own merits: do not anchor on the declared code. Use low confidence when material, construction (knitted vs woven) or use is missing from the description.",
    messages: [{ role: "user", content: `Classify these line items:\n${list}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return [];
  return response.parsed_output.items;
}
