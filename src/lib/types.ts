import { z } from "zod";

export const DOC_TYPES = [
  "commercial_invoice",
  "packing_list",
  "bill_of_lading",
  "certificate_of_origin",
  "shipping_bill",
  "letter_of_credit",
  "other",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  commercial_invoice: "Commercial Invoice",
  packing_list: "Packing List",
  bill_of_lading: "Bill of Lading",
  certificate_of_origin: "Certificate of Origin",
  shipping_bill: "Shipping Bill",
  letter_of_credit: "Letter of Credit",
  other: "Other",
};

const str = z.string().nullable();
const num = z.number().nullable();

export const PartySchema = z.object({
  name: str,
  address: str,
  country: str,
});

export const LineItemSchema = z.object({
  description: z.string(),
  hsCode: str.describe("HS / ITC-HS code exactly as printed, digits only"),
  quantity: num,
  unit: str,
  unitPrice: num,
  amount: num,
});

/**
 * One normalized schema covers every trade document. Fields that don't
 * apply to a document type are null. Used both as the Claude structured
 * output format and as the shape produced by the offline heuristic parser.
 */
export const ExtractedDocSchema = z.object({
  docType: z.enum(DOC_TYPES),
  documentNumber: str,
  documentDate: str.describe("ISO date YYYY-MM-DD"),
  invoiceNumberRef: str.describe("Commercial invoice number referenced by this document"),
  exporter: PartySchema,
  consignee: PartySchema,
  exporterIec: str.describe("Indian Importer-Exporter Code, 10 characters"),
  exporterGstin: str,
  portOfLoading: str,
  portOfDischarge: str,
  countryOfOrigin: str,
  finalDestination: str,
  incoterms: str,
  currency: str.describe("ISO 4217 code, e.g. USD"),
  totalValue: num,
  totalQuantity: num,
  quantityUnit: str,
  numberOfPackages: num,
  grossWeightKg: num,
  netWeightKg: num,
  vesselOrFlight: str,
  blNumber: str,
  containerNumbers: z.array(z.string()),
  lcNumber: str,
  latestShipmentDate: str.describe("Letter of credit latest shipment date, ISO"),
  lcExpiryDate: str.describe("Letter of credit expiry date, ISO"),
  lineItems: z.array(LineItemSchema),
  lowConfidenceFields: z
    .array(z.string())
    .describe("Names of fields that were unclear, handwritten, cut off or guessed"),
});

export type ExtractedDoc = z.infer<typeof ExtractedDocSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;

export interface SourceDoc {
  id: string;
  fileName: string;
  extractedBy: "claude" | "heuristic";
  data: ExtractedDoc;
}

export type Severity = "critical" | "major" | "minor" | "info";
export type FindingStatus = "open" | "resolved" | "false_positive";

export interface Finding {
  id: string;
  ruleId: string;
  severity: Severity;
  category: "missing_field" | "consistency" | "arithmetic" | "format" | "hs_code" | "dates" | "letter_of_credit" | "extraction";
  title: string;
  detail: string;
  fix: string;
  /** Values seen per document, for side-by-side display. */
  evidence?: { docId: string; field: string; value: string | null }[];
  status: FindingStatus;
  reviewerNote?: string;
}

export interface HsSuggestion {
  description: string;
  declared: string | null;
  suggested: string | null;
  suggestedDescription: string | null;
  confidence: "high" | "medium" | "low";
  source: "claude" | "reference_table";
  rationale: string;
  matchesDeclared: boolean | null;
}

export type CheckStatus = "issues_found" | "needs_review" | "clear";

export interface AuditEvent {
  at: string;
  action: string;
  detail?: string;
}

export interface CheckResult {
  id: string;
  name: string;
  createdAt: string;
  status: CheckStatus;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  docs: SourceDoc[];
  findings: Finding[];
  hsSuggestions: HsSuggestion[];
  audit: AuditEvent[];
  mode: "ai" | "offline";
}
