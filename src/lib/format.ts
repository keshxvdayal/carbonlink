import type { DocType } from "@/lib/types";

export function timeAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/** Best-effort guess from a filename, used only to tick the upload checklist. */
export function guessDocType(fileName: string): DocType | null {
  const n = fileName.toLowerCase().replace(/[_\-.]+/g, " ");
  if (/letter of credit|\blc\b|\bl c\b|mt700|credit/.test(n)) return "letter_of_credit";
  if (/lading|\bbl\b|\bb l\b|\bbol\b|waybill|\bawb\b/.test(n)) return "bill_of_lading";
  if (/origin|\bcoo\b/.test(n)) return "certificate_of_origin";
  if (/packing|\bpl\b/.test(n)) return "packing_list";
  if (/shipping bill|\bsb\b/.test(n)) return "shipping_bill";
  if (/invoice|\binv\b|\bci\b/.test(n)) return "commercial_invoice";
  return null;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
