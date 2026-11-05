import { hs6 } from "@/lib/hs";
import { DOC_TYPE_LABELS, type DocType, type ExtractedDoc, type Finding, type Severity, type SourceDoc } from "@/lib/types";

type Draft = Omit<Finding, "id" | "status">;

// ---------- normalisers ----------

const COMPANY_NOISE = /\b(the|pvt|private|ltd|limited|llc|inc|incorporated|co|company|corp|corporation|gmbh|plc|llp|fze|fzco)\b/g;

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(COMPANY_NOISE, " ").replace(/\s+/g, " ").trim();
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

function normalizePlace(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z ]/g, " ").replace(/\b(port|of|seaport|india|in|icd|terminal|nhava sheva)\b/g, (w) => (w === "nhava sheva" ? "jnpt" : " ")).replace(/\s+/g, " ").trim();
}

const placesMatch = (a: string, b: string) => {
  const na = normalizePlace(a);
  const nb = normalizePlace(b);
  return na === nb || (na.length > 2 && nb.length > 2 && (na.includes(nb) || nb.includes(na)));
};

const namesMatch = (a: string, b: string) => {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || tokenSimilarity(na, nb) >= 0.8;
};

const fmt = (v: unknown) => (v === null || v === undefined ? null : String(v));
const label = (d: SourceDoc) => DOC_TYPE_LABELS[d.data.docType];

// ---------- format validators ----------

const IEC_RE = /^[A-Z0-9]{10}$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** ISO 6346 container number check digit. */
export function containerCheckDigitValid(id: string): boolean {
  const c = id.toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z]{4}\d{7}$/.test(c)) return false;
  const letterValue = (ch: string) => {
    let v = 10;
    for (let code = 65; code <= 90; code++) {
      if (v % 11 === 0) v++;
      if (String.fromCharCode(code) === ch) return v;
      v++;
    }
    return 0;
  };
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = c[i];
    const val = i < 4 ? letterValue(ch) : Number(ch);
    sum += val * 2 ** i;
  }
  return (sum % 11) % 10 === Number(c[10]);
}

// ---------- rule groups ----------

const REQUIRED: Partial<Record<DocType, { field: string; get: (d: ExtractedDoc) => unknown; severity: Severity }[]>> = {
  commercial_invoice: [
    { field: "Invoice number", get: (d) => d.documentNumber, severity: "critical" },
    { field: "Invoice date", get: (d) => d.documentDate, severity: "major" },
    { field: "Exporter name", get: (d) => d.exporter.name, severity: "critical" },
    { field: "Consignee name", get: (d) => d.consignee.name, severity: "critical" },
    { field: "Currency", get: (d) => d.currency, severity: "critical" },
    { field: "Total invoice value", get: (d) => d.totalValue, severity: "critical" },
    { field: "Incoterms", get: (d) => d.incoterms, severity: "major" },
    { field: "Port of loading", get: (d) => d.portOfLoading, severity: "minor" },
    { field: "Port of discharge", get: (d) => d.portOfDischarge, severity: "minor" },
    { field: "Country of origin", get: (d) => d.countryOfOrigin, severity: "major" },
    { field: "Exporter IEC", get: (d) => d.exporterIec, severity: "major" },
  ],
  packing_list: [
    { field: "Number of packages", get: (d) => d.numberOfPackages, severity: "major" },
    { field: "Gross weight", get: (d) => d.grossWeightKg, severity: "major" },
    { field: "Net weight", get: (d) => d.netWeightKg, severity: "major" },
    { field: "Invoice reference", get: (d) => d.invoiceNumberRef, severity: "minor" },
  ],
  bill_of_lading: [
    { field: "B/L number", get: (d) => d.blNumber, severity: "critical" },
    { field: "Vessel / voyage", get: (d) => d.vesselOrFlight, severity: "major" },
    { field: "Port of loading", get: (d) => d.portOfLoading, severity: "major" },
    { field: "Port of discharge", get: (d) => d.portOfDischarge, severity: "major" },
    { field: "Shipped-on-board date", get: (d) => d.documentDate, severity: "major" },
    { field: "Consignee", get: (d) => d.consignee.name, severity: "major" },
  ],
  certificate_of_origin: [
    { field: "Country of origin", get: (d) => d.countryOfOrigin, severity: "critical" },
    { field: "Invoice reference", get: (d) => d.invoiceNumberRef, severity: "major" },
    { field: "Consignee", get: (d) => d.consignee.name, severity: "major" },
  ],
  letter_of_credit: [
    { field: "L/C number", get: (d) => d.lcNumber ?? d.documentNumber, severity: "major" },
    { field: "Latest shipment date", get: (d) => d.latestShipmentDate, severity: "major" },
    { field: "Expiry date", get: (d) => d.lcExpiryDate, severity: "major" },
    { field: "Credit amount", get: (d) => d.totalValue, severity: "major" },
  ],
};

function checkCompleteness(docs: SourceDoc[], out: Draft[]) {
  const has = (t: DocType) => docs.some((d) => d.data.docType === t);
  if (!has("commercial_invoice"))
    out.push({ ruleId: "SET-001", severity: "critical", category: "missing_field", title: "No commercial invoice in the document set", detail: "Value, consignee and HS checks are anchored on the commercial invoice.", fix: "Add the commercial invoice to this check." });
  if (!has("packing_list"))
    out.push({ ruleId: "SET-002", severity: "major", category: "missing_field", title: "No packing list in the document set", detail: "Package count and weight checks could not run.", fix: "Add the packing list." });
  if (!has("bill_of_lading"))
    out.push({ ruleId: "SET-003", severity: "info", category: "missing_field", title: "No bill of lading provided", detail: "Transport-document checks (ports, vessel, containers, shipment date) were skipped.", fix: "Add the draft B/L before it is finalised by the carrier to catch errors while they are still cheap to correct." });

  for (const d of docs) {
    for (const r of REQUIRED[d.data.docType] ?? []) {
      const v = r.get(d.data);
      if (v === null || v === undefined || v === "")
        out.push({ ruleId: "REQ-001", severity: r.severity, category: "missing_field", title: `${label(d)} is missing: ${r.field}`, detail: `"${r.field}" was not found on ${d.fileName}.`, fix: `Add ${r.field.toLowerCase()} to the ${label(d).toLowerCase()}.`, evidence: [{ docId: d.id, field: r.field, value: null }] });
    }
  }
}

function checkFormats(docs: SourceDoc[], out: Draft[]) {
  for (const d of docs) {
    const x = d.data;
    if (x.exporterIec && !IEC_RE.test(x.exporterIec.replace(/\s/g, "").toUpperCase()))
      out.push({ ruleId: "FMT-001", severity: "major", category: "format", title: "IEC number has an invalid format", detail: `"${x.exporterIec}" on ${label(d)} is not a 10-character IEC.`, fix: "Copy the IEC exactly from the DGFT IEC certificate.", evidence: [{ docId: d.id, field: "IEC", value: x.exporterIec }] });
    if (x.exporterGstin && !GSTIN_RE.test(x.exporterGstin.replace(/\s/g, "").toUpperCase()))
      out.push({ ruleId: "FMT-002", severity: "major", category: "format", title: "GSTIN has an invalid format", detail: `"${x.exporterGstin}" on ${label(d)} does not match the 15-character GSTIN pattern.`, fix: "Copy the GSTIN exactly from the GST registration certificate.", evidence: [{ docId: d.id, field: "GSTIN", value: x.exporterGstin }] });
    for (const c of x.containerNumbers) {
      if (!containerCheckDigitValid(c))
        out.push({ ruleId: "FMT-003", severity: "major", category: "format", title: `Container number ${c} fails the ISO 6346 check digit`, detail: `The last digit of ${c} on ${label(d)} does not match the computed check digit, which usually means a typo.`, fix: "Re-check the container number against the container itself or the carrier's booking confirmation.", evidence: [{ docId: d.id, field: "Container", value: c }] });
    }
    if (x.currency && !/^[A-Z]{3}$/.test(x.currency))
      out.push({ ruleId: "FMT-004", severity: "minor", category: "format", title: "Currency is not an ISO 4217 code", detail: `"${x.currency}" on ${label(d)}.`, fix: "Use the 3-letter code, e.g. USD, EUR, GBP.", evidence: [{ docId: d.id, field: "Currency", value: x.currency }] });
    x.lineItems.forEach((li, i) => {
      if (!li.hsCode) {
        if (x.docType === "commercial_invoice" || x.docType === "shipping_bill")
          out.push({ ruleId: "HS-001", severity: "major", category: "hs_code", title: `Line ${i + 1} has no HS code`, detail: `"${li.description}" on ${label(d)} has no HS code.`, fix: "Add the 8-digit ITC-HS code for this item.", evidence: [{ docId: d.id, field: `Line ${i + 1} HS`, value: null }] });
      } else if (!/^\d{6}(\d{2})?(\d{2})?$/.test(li.hsCode)) {
        out.push({ ruleId: "HS-002", severity: "major", category: "hs_code", title: `Line ${i + 1} HS code "${li.hsCode}" is malformed`, detail: "HS codes should be 6, 8 or 10 digits.", fix: "Correct the HS code; Indian export documents use the 8-digit ITC-HS code.", evidence: [{ docId: d.id, field: `Line ${i + 1} HS`, value: li.hsCode }] });
      } else if (li.hsCode.length === 6 && (x.docType === "commercial_invoice" || x.docType === "shipping_bill")) {
        out.push({ ruleId: "HS-003", severity: "minor", category: "hs_code", title: `Line ${i + 1} uses a 6-digit HS code`, detail: `Indian shipping bills require the 8-digit ITC-HS code; "${li.hsCode}" is only the international subheading.`, fix: "Use the full 8-digit ITC-HS code consistently on all documents.", evidence: [{ docId: d.id, field: `Line ${i + 1} HS`, value: li.hsCode }] });
      }
    });
  }
}

function checkArithmetic(docs: SourceDoc[], out: Draft[]) {
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.001);
  for (const d of docs) {
    const x = d.data;
    if (x.docType === "commercial_invoice") {
      x.lineItems.forEach((li, i) => {
        if (li.quantity !== null && li.unitPrice !== null && li.amount !== null && !close(li.quantity * li.unitPrice, li.amount))
          out.push({ ruleId: "ARI-001", severity: "major", category: "arithmetic", title: `Line ${i + 1} amount doesn't equal quantity × unit price`, detail: `${li.quantity} × ${li.unitPrice} = ${(li.quantity * li.unitPrice).toFixed(2)}, but the invoice shows ${li.amount}.`, fix: "Recalculate the line amount.", evidence: [{ docId: d.id, field: `Line ${i + 1} amount`, value: String(li.amount) }] });
      });
      const amounts = x.lineItems.map((li) => li.amount);
      if (x.totalValue !== null && amounts.length && amounts.every((a) => a !== null)) {
        const sum = (amounts as number[]).reduce((a, b) => a + b, 0);
        if (!close(sum, x.totalValue))
          out.push({ ruleId: "ARI-002", severity: "critical", category: "arithmetic", title: "Line items don't add up to the invoice total", detail: `Lines sum to ${sum.toFixed(2)}; the stated total is ${x.totalValue}. Customs and banks both reject value mismatches. (If freight/insurance is added separately, make sure it is shown as its own line.)`, fix: "Correct the total or the line amounts.", evidence: [{ docId: d.id, field: "Total value", value: String(x.totalValue) }] });
      }
      const qtys = x.lineItems.map((li) => li.quantity);
      if (x.totalQuantity !== null && qtys.length && qtys.every((q) => q !== null)) {
        const sum = (qtys as number[]).reduce((a, b) => a + b, 0);
        if (!close(sum, x.totalQuantity))
          out.push({ ruleId: "ARI-003", severity: "major", category: "arithmetic", title: "Line quantities don't add up to the total quantity", detail: `Lines sum to ${sum}; the stated total quantity is ${x.totalQuantity}.`, fix: "Correct the total quantity.", evidence: [{ docId: d.id, field: "Total quantity", value: String(x.totalQuantity) }] });
      }
    }
    if (x.grossWeightKg !== null && x.netWeightKg !== null && x.netWeightKg > x.grossWeightKg)
      out.push({ ruleId: "ARI-004", severity: "major", category: "arithmetic", title: `Net weight exceeds gross weight on the ${label(d).toLowerCase()}`, detail: `Net ${x.netWeightKg} kg > gross ${x.grossWeightKg} kg. The two values are probably swapped.`, fix: "Swap or correct the weights.", evidence: [{ docId: d.id, field: "Net weight", value: String(x.netWeightKg) }, { docId: d.id, field: "Gross weight", value: String(x.grossWeightKg) }] });
  }
}

type Compare = {
  ruleId: string;
  field: string;
  severity: Severity;
  get: (d: ExtractedDoc) => string | number | null;
  same: (a: string | number, b: string | number) => boolean;
  types?: DocType[];
  fix: string;
};

const numClose = (tolPct: number) => (a: string | number, b: string | number) => Math.abs(Number(a) - Number(b)) <= Math.max(0.01, Math.abs(Number(b)) * tolPct);
const textEq = (a: string | number, b: string | number) => String(a).trim().toUpperCase() === String(b).trim().toUpperCase();

const COMPARISONS: Compare[] = [
  { ruleId: "XDC-001", field: "Consignee", severity: "critical", get: (d) => d.consignee.name, same: (a, b) => namesMatch(String(a), String(b)), types: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin", "shipping_bill"], fix: "Use the consignee name exactly as on the purchase order / L/C on every document." },
  { ruleId: "XDC-002", field: "Exporter", severity: "major", get: (d) => d.exporter.name, same: (a, b) => namesMatch(String(a), String(b)), types: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin", "shipping_bill"], fix: "Use the exporter's registered name (as on the IEC) on every document." },
  { ruleId: "XDC-003", field: "Port of loading", severity: "major", get: (d) => d.portOfLoading, same: (a, b) => placesMatch(String(a), String(b)), types: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin", "shipping_bill"], fix: "Align the port of loading with the carrier booking." },
  { ruleId: "XDC-004", field: "Port of discharge", severity: "major", get: (d) => d.portOfDischarge, same: (a, b) => placesMatch(String(a), String(b)), types: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin", "shipping_bill"], fix: "Align the port of discharge with the carrier booking." },
  { ruleId: "XDC-005", field: "Country of origin", severity: "major", get: (d) => d.countryOfOrigin, same: (a, b) => placesMatch(String(a), String(b)), fix: "Origin must be identical on the invoice and certificate of origin." },
  { ruleId: "XDC-006", field: "Currency", severity: "critical", get: (d) => d.currency, same: textEq, fix: "Use one invoicing currency across all documents." },
  { ruleId: "XDC-007", field: "Total value", severity: "critical", get: (d) => d.totalValue, same: numClose(0.0005), types: ["commercial_invoice", "certificate_of_origin", "shipping_bill"], fix: "The declared value must match the commercial invoice exactly." },
  { ruleId: "XDC-008", field: "Total quantity", severity: "major", get: (d) => d.totalQuantity, same: numClose(0), types: ["commercial_invoice", "packing_list", "certificate_of_origin", "shipping_bill"], fix: "Recount and align the total quantity." },
  { ruleId: "XDC-009", field: "Number of packages", severity: "major", get: (d) => d.numberOfPackages, same: numClose(0), fix: "Align the package/carton count with the physical stuffing tally." },
  { ruleId: "XDC-010", field: "Gross weight (kg)", severity: "major", get: (d) => d.grossWeightKg, same: numClose(0.005), fix: "Use the weighbridge gross weight on every document." },
  { ruleId: "XDC-011", field: "Net weight (kg)", severity: "minor", get: (d) => d.netWeightKg, same: numClose(0.005), fix: "Align net weight across documents." },
  { ruleId: "XDC-012", field: "Incoterms", severity: "minor", get: (d) => d.incoterms?.split(/\s/)[0] ?? null, same: textEq, types: ["commercial_invoice", "shipping_bill", "letter_of_credit"], fix: "Use the Incoterm agreed in the contract / L/C." },
  { ruleId: "XDC-013", field: "Vessel / voyage", severity: "minor", get: (d) => d.vesselOrFlight, same: (a, b) => normalizeName(String(a)) === normalizeName(String(b)), fix: "Use the vessel and voyage from the carrier's booking." },
];

function checkCrossDocument(docs: SourceDoc[], out: Draft[]) {
  for (const c of COMPARISONS) {
    const vals = docs
      .filter((d) => !c.types || c.types.includes(d.data.docType))
      .map((d) => ({ d, v: c.get(d.data) }))
      .filter((x): x is { d: SourceDoc; v: string | number } => x.v !== null && x.v !== "");
    if (vals.length < 2) continue;
    const anchor = vals.find((x) => x.d.data.docType === "commercial_invoice") ?? vals[0];
    const mismatched = vals.filter((x) => x !== anchor && !c.same(x.v, anchor.v));
    if (!mismatched.length) continue;
    out.push({
      ruleId: c.ruleId,
      severity: c.severity,
      category: "consistency",
      title: `${c.field} differs between documents`,
      detail: `${label(anchor.d)} says "${anchor.v}"; ${mismatched.map((m) => `${label(m.d)} says "${m.v}"`).join("; ")}.`,
      fix: c.fix,
      evidence: vals.map((x) => ({ docId: x.d.id, field: c.field, value: fmt(x.v) })),
    });
  }

  // Invoice number referenced by other documents
  const invoice = docs.find((d) => d.data.docType === "commercial_invoice");
  if (invoice?.data.documentNumber) {
    for (const d of docs) {
      if (d === invoice || !d.data.invoiceNumberRef) continue;
      if (d.data.invoiceNumberRef.replace(/\s/g, "").toUpperCase() !== invoice.data.documentNumber.replace(/\s/g, "").toUpperCase())
        out.push({ ruleId: "XDC-020", severity: "major", category: "consistency", title: `${label(d)} references a different invoice number`, detail: `Invoice is "${invoice.data.documentNumber}"; ${label(d)} references "${d.data.invoiceNumberRef}".`, fix: "Correct the invoice reference.", evidence: [{ docId: invoice.id, field: "Invoice no.", value: invoice.data.documentNumber }, { docId: d.id, field: "Invoice ref", value: d.data.invoiceNumberRef }] });
    }
  }

  // Container numbers
  const withContainers = docs.filter((d) => d.data.containerNumbers.length);
  if (withContainers.length >= 2) {
    const key = (d: SourceDoc) => [...d.data.containerNumbers].map((c) => c.toUpperCase()).sort().join(", ");
    const first = key(withContainers[0]);
    if (withContainers.some((d) => key(d) !== first))
      out.push({ ruleId: "XDC-021", severity: "major", category: "consistency", title: "Container numbers differ between documents", detail: withContainers.map((d) => `${label(d)}: ${key(d)}`).join("; "), fix: "Use the container numbers from the stuffing report / carrier on every document.", evidence: withContainers.map((d) => ({ docId: d.id, field: "Containers", value: key(d) })) });
  }

  // HS codes per line across documents (matched by line position and 6-digit level)
  const withItems = docs.filter((d) => d.data.lineItems.some((li) => li.hsCode));
  if (withItems.length >= 2) {
    const anchor = withItems.find((d) => d.data.docType === "commercial_invoice") ?? withItems[0];
    anchor.data.lineItems.forEach((li, i) => {
      const a = hs6(li.hsCode);
      if (!a) return;
      const others = withItems.filter((d) => d !== anchor).map((d) => ({ d, code: d.data.lineItems[i]?.hsCode ?? null })).filter((o) => o.code && hs6(o.code) !== a);
      if (others.length)
        out.push({ ruleId: "XDC-022", severity: "critical", category: "hs_code", title: `HS code for line ${i + 1} differs between documents`, detail: `${label(anchor)} declares ${li.hsCode} for "${li.description}"; ${others.map((o) => `${label(o.d)} shows ${o.code}`).join("; ")}.`, fix: "Decide the correct classification and use the identical code on every document.", evidence: [{ docId: anchor.id, field: `Line ${i + 1} HS`, value: li.hsCode }, ...others.map((o) => ({ docId: o.d.id, field: `Line ${i + 1} HS`, value: o.code }))] });
    });
  }
}

const days = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 86_400_000;

function checkDatesAndLc(docs: SourceDoc[], out: Draft[]) {
  const invoice = docs.find((d) => d.data.docType === "commercial_invoice");
  const bl = docs.find((d) => d.data.docType === "bill_of_lading");
  const coo = docs.find((d) => d.data.docType === "certificate_of_origin");
  const lc = docs.find((d) => d.data.docType === "letter_of_credit");
  const blDate = bl?.data.documentDate;

  if (invoice?.data.documentDate && blDate && days(invoice.data.documentDate, blDate) > 0)
    out.push({ ruleId: "DAT-001", severity: "minor", category: "dates", title: "Invoice is dated after the shipment date", detail: `Invoice ${invoice.data.documentDate} vs B/L on-board ${blDate}.`, fix: "Date the invoice on or before shipment.", evidence: [{ docId: invoice.id, field: "Date", value: invoice.data.documentDate }, { docId: bl!.id, field: "On-board date", value: blDate }] });
  if (coo?.data.documentDate && blDate && days(coo.data.documentDate, blDate) > 0)
    out.push({ ruleId: "DAT-002", severity: "minor", category: "dates", title: "Certificate of origin is dated after shipment", detail: `COO ${coo.data.documentDate} vs B/L on-board ${blDate}. Some importing countries only accept this as a 'retrospectively issued' certificate.`, fix: "Check the importing country's rules; apply for the COO before shipment where possible.", evidence: [{ docId: coo.id, field: "Date", value: coo.data.documentDate }, { docId: bl!.id, field: "On-board date", value: blDate }] });

  if (!lc) return;
  const l = lc.data;
  if (l.latestShipmentDate && blDate && days(blDate, l.latestShipmentDate) > 0)
    out.push({ ruleId: "LC-001", severity: "critical", category: "letter_of_credit", title: "Shipment is later than the L/C latest shipment date", detail: `B/L on-board ${blDate}; L/C allows shipment until ${l.latestShipmentDate}. The bank will treat this as a discrepancy.`, fix: "Obtain an L/C amendment extending the shipment date before presenting documents.", evidence: [{ docId: bl!.id, field: "On-board date", value: blDate }, { docId: lc.id, field: "Latest shipment", value: l.latestShipmentDate }] });
  if (l.lcExpiryDate && blDate) {
    const presentationDeadline = new Date(Date.parse(blDate) + 21 * 86_400_000).toISOString().slice(0, 10);
    if (days(blDate, l.lcExpiryDate) > 0)
      out.push({ ruleId: "LC-002", severity: "critical", category: "letter_of_credit", title: "Shipment is after the L/C expiry date", detail: `B/L ${blDate}, L/C expiry ${l.lcExpiryDate}.`, fix: "The credit has expired; an amendment is required.", evidence: [{ docId: lc.id, field: "Expiry", value: l.lcExpiryDate }] });
    else if (days(l.lcExpiryDate, blDate) < 7)
      out.push({ ruleId: "LC-003", severity: "major", category: "letter_of_credit", title: "Little time left to present documents under the L/C", detail: `The L/C expires ${l.lcExpiryDate}, ${Math.round(days(l.lcExpiryDate, blDate))} day(s) after shipment. Unless the credit states otherwise, UCP 600 also caps presentation at 21 days after shipment (${presentationDeadline}).`, fix: "Prioritise presenting this set to the bank.", evidence: [{ docId: lc.id, field: "Expiry", value: l.lcExpiryDate }] });
  }
  if (invoice?.data.totalValue !== null && invoice?.data.totalValue !== undefined && l.totalValue !== null && invoice.data.totalValue > l.totalValue + 0.005)
    out.push({ ruleId: "LC-004", severity: "critical", category: "letter_of_credit", title: "Invoice value exceeds the L/C amount", detail: `Invoice ${invoice.data.totalValue} vs credit amount ${l.totalValue}.`, fix: "Reduce the invoice to within the credit amount or obtain an amendment.", evidence: [{ docId: invoice.id, field: "Total value", value: String(invoice.data.totalValue) }, { docId: lc.id, field: "Credit amount", value: String(l.totalValue) }] });
  if (invoice && l.exporter.name && invoice.data.exporter.name && !namesMatch(l.exporter.name, invoice.data.exporter.name))
    out.push({ ruleId: "LC-005", severity: "major", category: "letter_of_credit", title: "Invoice exporter doesn't match the L/C beneficiary", detail: `Beneficiary "${l.exporter.name}" vs invoice exporter "${invoice.data.exporter.name}".`, fix: "The invoice must be issued by the beneficiary named in the credit.", evidence: [{ docId: lc.id, field: "Beneficiary", value: l.exporter.name }, { docId: invoice.id, field: "Exporter", value: invoice.data.exporter.name }] });
  if (invoice && l.consignee.name && invoice.data.consignee.name && !namesMatch(l.consignee.name, invoice.data.consignee.name))
    out.push({ ruleId: "LC-006", severity: "major", category: "letter_of_credit", title: "Invoice consignee doesn't match the L/C applicant", detail: `Applicant "${l.consignee.name}" vs invoice consignee "${invoice.data.consignee.name}".`, fix: "Under UCP 600 the invoice must be made out in the name of the applicant unless the credit says otherwise.", evidence: [{ docId: lc.id, field: "Applicant", value: l.consignee.name }, { docId: invoice.id, field: "Consignee", value: invoice.data.consignee.name }] });
  for (const [field, get] of [["Port of loading", (d: ExtractedDoc) => d.portOfLoading], ["Port of discharge", (d: ExtractedDoc) => d.portOfDischarge]] as const) {
    const lv = get(l);
    const bv = bl ? get(bl.data) : null;
    if (lv && bv && !placesMatch(lv, bv))
      out.push({ ruleId: "LC-007", severity: "critical", category: "letter_of_credit", title: `B/L ${field.toLowerCase()} doesn't match the L/C`, detail: `L/C: "${lv}"; B/L: "${bv}".`, fix: "Ship per the credit terms or get an amendment.", evidence: [{ docId: lc.id, field, value: lv }, { docId: bl!.id, field, value: bv }] });
  }
}

function checkExtractionConfidence(docs: SourceDoc[], out: Draft[]) {
  for (const d of docs) {
    if (d.data.lowConfidenceFields.length)
      out.push({ ruleId: "EXT-001", severity: "info", category: "extraction", title: `Verify unclear fields on ${d.fileName}`, detail: `The extractor was not confident reading: ${d.data.lowConfidenceFields.join(", ")}.`, fix: "A reviewer should check these values against the original document.", evidence: d.data.lowConfidenceFields.map((f) => ({ docId: d.id, field: f, value: null })) });
    if (d.data.docType === "other")
      out.push({ ruleId: "EXT-002", severity: "info", category: "extraction", title: `Could not identify the type of ${d.fileName}`, detail: "It was excluded from type-specific checks.", fix: "Confirm this is a trade document and re-upload it with a clearer scan if needed." });
  }
}

export function runRules(docs: SourceDoc[]): Draft[] {
  const out: Draft[] = [];
  checkCompleteness(docs, out);
  checkFormats(docs, out);
  checkArithmetic(docs, out);
  checkCrossDocument(docs, out);
  checkDatesAndLc(docs, out);
  checkExtractionConfidence(docs, out);
  return out;
}
