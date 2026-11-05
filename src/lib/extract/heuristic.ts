/**
 * Offline extractor for text documents laid out as "Label: value" lines
 * (see samples/). Used when no API key is configured and in tests.
 * It is deliberately strict: anything it can't place is skipped, not guessed.
 */
import { FUELS, type DocType, type ExtractedDoc, type ExtractedLine, type Fuel, type Unit } from "@/lib/types";

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/); // Indian DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-,]+(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function parseNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const UNIT_MAP: Record<string, Unit> = {
  kwh: "kWh", units: "kWh", unit: "kWh", mwh: "MWh",
  l: "L", ltr: "L", litre: "L", litres: "L", liter: "L", liters: "L", kl: "kL",
  kg: "kg", kgs: "kg", t: "t", mt: "t", tonne: "t", tonnes: "t", ton: "t", tons: "t",
  scm: "SCM", m3: "SCM", sm3: "SCM",
};

export function parseUnit(raw: string): Unit | null {
  const m = raw.toLowerCase().match(/(kwh|mwh|units?|kl|ltrs?|litres?|liters?|l|kgs?|mt|tonnes?|tons?|t|scm|sm3|m3)\b/);
  return m ? UNIT_MAP[m[1]] ?? null : null;
}

const FUEL_ALIASES: [RegExp, Fuel][] = [
  [/\b(hsd|diesel)\b/i, "diesel"],
  [/\b(furnace oil|fo|lshs|ldo)\b/i, "furnace_oil"],
  [/\b(png|natural gas|cng)\b/i, "natural_gas"],
  [/\blpg\b/i, "lpg"],
  [/\bpet ?coke\b/i, "pet_coke"],
  [/\b(met )?coke\b/i, "coke"],
  [/\bcoal\b/i, "coal"],
  [/\b(biomass|briquette|husk)\b/i, "biomass"],
];

export function parseFuel(raw: string): Fuel | null {
  for (const [re, f] of FUEL_ALIASES) if (re.test(raw)) return f;
  const direct = raw.toLowerCase().replace(/\s+/g, "_");
  return (FUELS as readonly string[]).includes(direct) ? (direct as Fuel) : null;
}

function detectType(text: string): DocType {
  const t = text.toLowerCase();
  if (/electricity bill|units consumed|discom|consumer no/.test(t)) return "electricity_bill";
  if (/weighbridge|weigh bridge|gross weight|tare/.test(t)) return "weighbridge_slip";
  if (/production register|daily production|production report/.test(t)) return "production_register";
  if (/purchase invoice|billets|wire rod|ingot|clinker/.test(t) && /invoice/.test(t)) return "purchase_invoice";
  if (/fuel|hsd|diesel|furnace oil|png|lpg|coal/.test(t) && /invoice|bill/.test(t)) return "fuel_invoice";
  return "other";
}

export function extractHeuristic(text: string): ExtractedDoc {
  const kv = new Map<string, string>();
  const lines: ExtractedLine[] = [];
  const low: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(/^([A-Za-z][A-Za-z0-9 ./()&-]{1,48}?)\s*:\s*(.+)$/);
    if (m) kv.set(m[1].trim().toLowerCase(), m[2].trim());
  }
  const get = (...keys: string[]) => {
    for (const k of keys) for (const [key, v] of kv) if (key === k) return v;
    return null;
  };

  const docType = detectType(text);
  const periodStart = parseDate(get("period from", "billing period from", "from", "date", "invoice date", "slip date"));
  const periodEnd = parseDate(get("period to", "billing period to", "to")) ?? periodStart;

  const pushQty = (kind: ExtractedLine["kind"], label: string, fuel: Fuel | null, material: string | null) => {
    const raw = get(label);
    if (!raw) return;
    const qty = parseNumber(raw);
    const unit = parseUnit(raw);
    if (qty === null || !unit) return;
    if (/\?|illegible|unclear/i.test(raw)) low.push(material ?? kind);
    lines.push({ kind, fuel, material, quantity: qty, unit, sourceQuote: `${label}: ${raw}`.slice(0, 120) });
  };

  if (docType === "electricity_bill") {
    pushQty("electricity", "units consumed (kwh)", null, null);
    pushQty("electricity", "units consumed", null, null);
    pushQty("renewable_electricity", "solar units (kwh)", null, "Rooftop solar");
    pushQty("renewable_electricity", "green energy (kwh)", null, "Green open access");
  }

  // Item lines: "Item: <name> | <qty> <unit>" for fuel, production, precursor and process inputs.
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(/^(Fuel|Product|Output|Material|Input|Precursor|Electrode)\s*:\s*(.+?)\s*\|\s*(.+)$/i);
    if (!m) continue;
    const head = m[1].toLowerCase();
    const name = m[2].trim();
    const qty = parseNumber(m[3]);
    const unit = parseUnit(m[3]);
    if (qty === null || !unit) continue;
    if (/\?|illegible|unclear/i.test(m[3])) low.push(name);
    let kind: ExtractedLine["kind"];
    if (head === "fuel") kind = "fuel";
    else if (head === "electrode") kind = "process_input";
    else if (head === "product" || head === "output") kind = "production";
    else kind = "precursor";
    lines.push({ kind, fuel: kind === "fuel" ? parseFuel(name) : null, material: kind === "fuel" ? null : name, quantity: qty, unit, sourceQuote: raw.trim().slice(0, 120) });
  }

  return {
    docType,
    issuer: get("issuer", "discom", "vendor", "supplier", "weighbridge", "company"),
    accountRef: get("consumer no", "consumer number", "account no", "invoice no", "slip no", "register ref"),
    periodStart,
    periodEnd,
    lines: lines.filter((l) => l.kind !== "fuel" || l.fuel),
    lowConfidenceFields: low,
  };
}
