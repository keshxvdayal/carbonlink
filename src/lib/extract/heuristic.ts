import type { DocType, ExtractedDoc, LineItem } from "@/lib/types";

/**
 * Offline, rule-based extractor for text documents laid out as
 * "Label: value" lines plus an optional pipe-delimited item table.
 * It keeps the app usable without an API key (demo, CI, air-gapped
 * pilots). Real scanned paperwork needs the Claude extractor.
 */

const DOC_TYPE_PATTERNS: [DocType, RegExp][] = [
  ["letter_of_credit", /letter of credit|documentary credit|\bmt ?700\b/i],
  ["bill_of_lading", /bill of lading|\bb\/l\b|sea ?waybill|airway ?bill/i],
  ["certificate_of_origin", /certificate of origin/i],
  ["packing_list", /packing list/i],
  ["shipping_bill", /shipping bill/i],
  ["commercial_invoice", /commercial invoice|tax invoice|\binvoice\b/i],
];

export function detectDocType(text: string): DocType {
  const head = text.split("\n").slice(0, 8).join("\n");
  for (const [type, re] of DOC_TYPE_PATTERNS) if (re.test(head)) return type;
  for (const [type, re] of DOC_TYPE_PATTERNS) if (re.test(text)) return type;
  return "other";
}

type FieldKey =
  | "documentNumber" | "documentDate" | "invoiceNumberRef"
  | "exporterName" | "exporterAddress" | "exporterCountry"
  | "consigneeName" | "consigneeAddress" | "consigneeCountry"
  | "exporterIec" | "exporterGstin" | "portOfLoading" | "portOfDischarge"
  | "countryOfOrigin" | "finalDestination" | "incoterms" | "currency"
  | "totalValue" | "totalQuantity" | "numberOfPackages" | "grossWeightKg"
  | "netWeightKg" | "vesselOrFlight" | "blNumber" | "containerNumbers"
  | "lcNumber" | "latestShipmentDate" | "lcExpiryDate";

const ALIASES: Record<FieldKey, string[]> = {
  documentNumber: ["invoice no", "invoice number", "packing list no", "document no", "certificate no", "shipping bill no", "doc no", "reference no"],
  documentDate: ["date", "invoice date", "document date", "issue date", "date of issue", "shipped on board date", "on board date"],
  invoiceNumberRef: ["invoice ref", "invoice reference", "against invoice", "ref invoice", "invoice no ref"],
  exporterName: ["exporter", "shipper", "seller", "beneficiary", "exporter name"],
  exporterAddress: ["exporter address", "shipper address", "seller address", "beneficiary address"],
  exporterCountry: ["exporter country", "shipper country"],
  consigneeName: ["consignee", "buyer", "applicant", "consignee name", "importer"],
  consigneeAddress: ["consignee address", "buyer address", "applicant address"],
  consigneeCountry: ["consignee country", "buyer country", "destination country"],
  exporterIec: ["iec", "iec no", "iec code", "importer exporter code"],
  exporterGstin: ["gstin", "gst no", "gst number"],
  portOfLoading: ["port of loading", "pol", "loading port", "port of shipment"],
  portOfDischarge: ["port of discharge", "pod", "discharge port", "port of destination"],
  countryOfOrigin: ["country of origin", "origin", "country of origin of goods"],
  finalDestination: ["final destination", "place of delivery"],
  incoterms: ["incoterms", "terms of delivery", "delivery terms", "incoterm"],
  currency: ["currency"],
  totalValue: ["total value", "invoice value", "total amount", "fob value", "cif value", "lc amount", "credit amount", "amount"],
  totalQuantity: ["total quantity", "total qty", "quantity"],
  numberOfPackages: ["number of packages", "no of packages", "total packages", "packages", "no of cartons", "cartons"],
  grossWeightKg: ["gross weight", "total gross weight", "gr wt", "g w"],
  netWeightKg: ["net weight", "total net weight", "nt wt", "n w"],
  vesselOrFlight: ["vessel", "vessel/voyage", "vessel name", "flight", "carrier"],
  blNumber: ["b/l no", "bl no", "bill of lading no", "b/l number", "bl number", "awb no"],
  containerNumbers: ["container no", "container nos", "container number", "containers"],
  lcNumber: ["lc no", "l/c no", "lc number", "documentary credit no", "credit number"],
  latestShipmentDate: ["latest shipment date", "latest date of shipment", "last shipment date"],
  lcExpiryDate: ["expiry date", "date of expiry", "lc expiry"],
};

const norm = (s: string) => s.toLowerCase().replace(/[.#:]/g, "").replace(/\s+/g, " ").trim();

const ALIAS_INDEX = new Map<string, FieldKey>();
for (const [key, list] of Object.entries(ALIASES) as [FieldKey, string[]][]) {
  for (const a of list) ALIAS_INDEX.set(norm(a), key);
}

export function parseNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/); // Indian format: DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s,-]+(\d{4})/i);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function parseItems(lines: string[]): LineItem[] {
  const rows = lines.filter((l) => l.includes("|"));
  if (rows.length < 2) return [];
  const cells = (l: string) => l.split("|").map((c) => c.trim()).filter((c, i, a) => !(c === "" && (i === 0 || i === a.length - 1)));
  const header = cells(rows[0]).map((h) => h.toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDesc = col("description", "goods", "item");
  const iHs = col("hs", "itc");
  const iQty = col("qty", "quantity");
  const iUnit = col("unit");
  const iPrice = col("price", "rate");
  const iAmt = col("amount", "value", "total");
  const items: LineItem[] = [];
  for (const row of rows.slice(1)) {
    if (/^[\s|:-]+$/.test(row)) continue;
    const c = cells(row);
    const get = (i: number) => (i >= 0 && i < c.length ? c[i] : null);
    const description = get(iDesc);
    if (!description) continue;
    items.push({
      description,
      hsCode: get(iHs)?.replace(/\D/g, "") || null,
      quantity: parseNumber(get(iQty)),
      unit: iUnit !== iPrice ? get(iUnit) : null,
      unitPrice: parseNumber(get(iPrice)),
      amount: parseNumber(get(iAmt)),
    });
  }
  return items;
}

export function extractHeuristic(text: string): ExtractedDoc {
  const lines = text.split(/\r?\n/);
  const found: Partial<Record<FieldKey, string>> = {};
  for (const line of lines) {
    if (line.includes("|")) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = ALIAS_INDEX.get(norm(line.slice(0, idx)));
    const value = line.slice(idx + 1).trim();
    if (key && value && !(key in found)) found[key] = value;
  }

  const docType = detectDocType(text);
  const qtyRaw = found.totalQuantity ?? null;
  const items = parseItems(lines);
  const valueRaw = found.totalValue ?? null;
  const currencyFromValue = valueRaw?.match(/\b(USD|EUR|GBP|INR|AED|JPY|AUD|CAD|SGD)\b/i)?.[1]?.toUpperCase() ?? null;

  const doc: ExtractedDoc = {
    docType,
    documentNumber: found.documentNumber ?? null,
    documentDate: parseDate(found.documentDate),
    invoiceNumberRef: found.invoiceNumberRef ?? (docType === "commercial_invoice" ? found.documentNumber ?? null : null),
    exporter: { name: found.exporterName ?? null, address: found.exporterAddress ?? null, country: found.exporterCountry ?? null },
    consignee: { name: found.consigneeName ?? null, address: found.consigneeAddress ?? null, country: found.consigneeCountry ?? null },
    exporterIec: found.exporterIec ?? null,
    exporterGstin: found.exporterGstin ?? null,
    portOfLoading: found.portOfLoading ?? null,
    portOfDischarge: found.portOfDischarge ?? null,
    countryOfOrigin: found.countryOfOrigin ?? null,
    finalDestination: found.finalDestination ?? null,
    incoterms: found.incoterms ?? null,
    currency: found.currency?.toUpperCase() ?? currencyFromValue,
    totalValue: parseNumber(valueRaw),
    totalQuantity: parseNumber(qtyRaw),
    quantityUnit: qtyRaw?.replace(/[\d,.\s]+/, "").trim() || null,
    numberOfPackages: parseNumber(found.numberOfPackages),
    grossWeightKg: parseNumber(found.grossWeightKg),
    netWeightKg: parseNumber(found.netWeightKg),
    vesselOrFlight: found.vesselOrFlight ?? null,
    blNumber: found.blNumber ?? (docType === "bill_of_lading" ? found.documentNumber ?? null : null),
    containerNumbers: (found.containerNumbers ?? "").split(/[,;/ ]+/).map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{4}\d{7}$/.test(c)),
    lcNumber: found.lcNumber ?? null,
    latestShipmentDate: parseDate(found.latestShipmentDate),
    lcExpiryDate: parseDate(found.lcExpiryDate),
    lineItems: items,
    lowConfidenceFields: [],
  };
  if (doc.docType === "letter_of_credit" && !doc.documentNumber) doc.documentNumber = doc.lcNumber;
  return doc;
}
