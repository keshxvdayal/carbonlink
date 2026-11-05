import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Reference enums                                                    *
 * ------------------------------------------------------------------ */

export const SECTORS = ["iron_steel", "aluminium", "cement", "fertilisers", "hydrogen"] as const;
export type Sector = (typeof SECTORS)[number];

export const FUELS = ["diesel", "furnace_oil", "lpg", "natural_gas", "coal", "coke", "pet_coke", "biomass"] as const;
export type Fuel = (typeof FUELS)[number];

export const UNITS = ["kWh", "MWh", "L", "kL", "kg", "t", "SCM"] as const;
export type Unit = (typeof UNITS)[number];

export const DOC_TYPES = ["electricity_bill", "fuel_invoice", "weighbridge_slip", "production_register", "purchase_invoice", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const ACTIVITY_KINDS = ["electricity", "renewable_electricity", "fuel", "process_input", "production", "precursor"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/* ------------------------------------------------------------------ *
 * Extraction schema (also the Claude structured-output schema)       *
 * ------------------------------------------------------------------ */

export const ExtractedLineSchema = z.object({
  kind: z.enum(ACTIVITY_KINDS).describe(
    "electricity = grid kWh consumed; renewable_electricity = kWh from a named renewable source (rooftop solar, green open access); fuel = fuel burned on site; process_input = graphite electrodes or other carbon inputs; production = finished output weighed or registered; precursor = purchased steel/aluminium/clinker input material",
  ),
  fuel: z.enum(FUELS).nullable().describe("Only for kind=fuel. HSD/diesel=diesel, FO/LSHS=furnace_oil, PNG/CNG=natural_gas"),
  material: z.string().nullable().describe("Product or material name exactly as printed (for production, precursor, process_input)"),
  quantity: z.number().describe("Numeric quantity exactly as printed, no thousands separators"),
  unit: z.enum(UNITS).describe("Convert MT/tonnes/tons to t, units/kWh to kWh, litres to L, kilolitres to kL, SCM/m3 to SCM"),
  sourceQuote: z.string().describe("The exact text on the document this number was read from, max 120 characters"),
});
export type ExtractedLine = z.infer<typeof ExtractedLineSchema>;

export const ExtractedDocSchema = z.object({
  docType: z.enum(DOC_TYPES),
  issuer: z.string().nullable().describe("Who issued the document: DISCOM, fuel vendor, weighbridge operator, the supplier itself"),
  accountRef: z.string().nullable().describe("Consumer/account/meter number, invoice number or slip number"),
  periodStart: z.string().nullable().describe("YYYY-MM-DD, first day the quantities cover (billing period start, or the slip/invoice date)"),
  periodEnd: z.string().nullable().describe("YYYY-MM-DD, last day covered (same as periodStart for a single-day slip or invoice)"),
  lines: z.array(ExtractedLineSchema),
  lowConfidenceFields: z.array(z.string()).describe("Fields or lines (by material/kind) that were blurred, handwritten, cut off or ambiguous"),
});
export type ExtractedDoc = z.infer<typeof ExtractedDocSchema>;

/* ------------------------------------------------------------------ *
 * Stored entities                                                    *
 * ------------------------------------------------------------------ */

export type Precursor = {
  id: string;
  name: string;
  cnCode: string;
  /** Embedded emissions of the precursor, tCO2e per tonne. */
  seeDirect: number;
  seeIndirect: number;
  /** "default" = EU default value, "actual" = from the precursor producer's data, "passport" = linked to another supplier's passport */
  source: "default" | "actual" | "passport";
  linkedSupplierId?: string;
  linkedProductId?: string;
};

export type Product = {
  id: string;
  name: string;
  cnCode: string;
  route: string; // key into ROUTES
  /** Tonnes exported to the EU per year through the exporter: drives the cost simulator. */
  euTonnesPerYear: number;
  precursors: Precursor[];
};

export type Evidence = {
  id: string;
  fileName: string;
  mimeType: string;
  sha256: string;
  size: number;
  uploadedAt: string;
  uploadedBy: "supplier" | "exporter";
  extractedBy: "claude" | "offline" | "manual";
  data: ExtractedDoc;
};

export type ActivityRow = {
  id: string;
  kind: ActivityKind;
  fuel: Fuel | null;
  material: string | null;
  /** For production/precursor rows: which product it belongs to. */
  productId: string | null;
  quantity: number;
  unit: Unit;
  periodStart: string | null;
  periodEnd: string | null;
  evidenceId: string | null;
  sourceQuote: string | null;
  origin: "ai" | "offline" | "manual";
  lowConfidence: boolean;
  confirmed: boolean;
};

export type VerifierComment = { at: string; author: string; rowId: string | null; text: string; status: "query" | "accepted" | "resolved" };

export type SupplierStatus = "invited" | "collecting" | "submitted" | "verified";

export type Supplier = {
  id: string;
  name: string;
  city: string;
  state: string;
  contactName: string;
  phone: string;
  language: Lang;
  status: SupplierStatus;
  createdAt: string;
  submittedAt: string | null;
  /** Secret link tokens. */
  portalToken: string;
  verifierToken: string;
  passportToken: string;
  products: Product[];
  evidence: Evidence[];
  activity: ActivityRow[];
  comments: VerifierComment[];
  verification: { by: string; at: string; statement: string } | null;
  /** Buyers this supplier has shared its passport with (network effect). */
  sharedWith: string[];
};

export type AuditEntry = {
  seq: number;
  at: string;
  actor: string;
  action: string;
  detail: string;
  supplierId: string | null;
  prevHash: string;
  hash: string;
};

export type Settings = {
  exporterName: string;
  reportingYear: number;
  etsPriceEur: number;
  eurInr: number;
  gridEf: number; // tCO2/MWh
  /** Carbon price effectively paid in India per tCO2 (deductible). 0 until CCTS prices exist. */
  originCarbonPriceEur: number;
  defaultOverrides: Record<string, { direct: number; indirect: number }>;
};

export type Db = {
  version: 1;
  settings: Settings;
  suppliers: Supplier[];
  audit: AuditEntry[];
};

export const LANGS = ["en", "hi", "gu", "ta", "pa"] as const;
export type Lang = (typeof LANGS)[number];

/* ------------------------------------------------------------------ *
 * Calculation outputs                                                *
 * ------------------------------------------------------------------ */

export type Severity = "critical" | "major" | "minor" | "info";

export type Flag = {
  id: string;
  rule: string;
  severity: Severity;
  title: string;
  detail: string;
  rowIds: string[];
};

export type ProductResult = {
  productId: string;
  name: string;
  cnCode: string;
  sector: Sector | null;
  outputTonnes: number;
  massShare: number;
  attributedDirect: number; // tCO2
  attributedIndirect: number; // tCO2
  precursorDirect: number;
  precursorIndirect: number;
  seeDirect: number; // tCO2/t
  seeIndirect: number;
  /** The figure CBAM prices for this sector (direct only for steel/aluminium/hydrogen; direct+indirect for cement/fertilisers). */
  seePriced: number;
  defaultDirect: number | null;
  defaultIndirect: number | null;
  defaultPriced: number | null;
  usesDefaultPrecursor: boolean;
};

export type InstallationResult = {
  periodStart: string | null;
  periodEnd: string | null;
  months: number;
  fuelEmissions: { fuel: Fuel; quantity: number; unit: Unit; energyGJ: number; tco2: number }[];
  processEmissions: number;
  directTotal: number;
  electricityMWh: number;
  renewableMWh: number;
  indirectTotal: number;
  outputTonnes: number;
  products: ProductResult[];
  intensity: { kwhPerT: number | null; fuelGJPerT: number | null };
};
