import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ExtractedDocSchema, type ExtractedDoc } from "@/lib/types";

export const MODEL = process.env.CARBONLINK_MODEL ?? "claude-opus-5-5";

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

const SYSTEM = `You read source documents from small Indian manufacturers (steel, aluminium, cement units) so their greenhouse-gas emissions can be calculated for the EU Carbon Border Adjustment Mechanism (CBAM). A verifier will later compare every number you return against the original document.

Documents you will see: DISCOM electricity bills (MSEDCL, PSPCL, DGVCL, TANGEDCO, etc.), fuel invoices (HSD/diesel, furnace oil, LSHS, PNG, LPG, coal, pet coke), weighbridge slips, handwritten or printed production registers, and purchase invoices for billets, wire rod, ingots or clinker.

Rules:
- Copy quantities exactly as printed. Never correct, round, estimate or fill from general knowledge. If a value is missing, leave it out.
- Electricity: report the energy consumed in kWh for the billing period (units consumed / net kWh). Never report kVAh, kVA demand or rupee amounts as kWh. If both kWh and kVAh are printed, use kWh and mention kVAh in lowConfidenceFields only if kWh is absent.
- A bill that shows rooftop solar / open-access green energy separately: report grid kWh as electricity and the renewable kWh as renewable_electricity.
- Fuel: one line per fuel. HSD/diesel → diesel; FO/LSHS/LDO → furnace_oil; PNG/CNG/natural gas → natural_gas.
- Weighbridge slips and production registers: the NET weight of finished product is production; weight of purchased input material (billets, wire rod, ingots, scrap, clinker) is precursor.
- Purchase invoices for billets/wire rod/ingots/clinker: precursor lines.
- Graphite electrodes or carbon raisers: process_input.
- Dates as YYYY-MM-DD. For a monthly register or bill use the first and last day it covers.
- sourceQuote: the exact snippet the number came from, so a reviewer can find it.
- Put any value that is blurred, handwritten and unclear, cut off, overwritten or ambiguous in lowConfidenceFields (name the line by its material or kind).`;

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
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [contentFor(file), { type: "text", text: `Extract the activity data from "${file.name}".` }],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new ExtractionError(`The model declined to process ${file.name}.`);
  if (response.stop_reason === "max_tokens") throw new ExtractionError(`${file.name} is too long to extract in one pass. Split it into separate pages.`);
  if (!response.parsed_output) throw new ExtractionError(`Could not read ${file.name}.`);
  return response.parsed_output;
}
