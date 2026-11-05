import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { runCheck } from "@/lib/pipeline";
import { containerCheckDigitValid } from "@/lib/rules";
import { extractHeuristic, parseDate } from "@/lib/extract/heuristic";

const load = (set: string) => {
  const dir = path.join(process.cwd(), "samples", set);
  return readdirSync(dir).sort().map((f) => ({ name: f, mimeType: "text/plain", data: readFileSync(path.join(dir, f)) }));
};

test("ISO 6346 check digit", () => {
  assert.equal(containerCheckDigitValid("CSQU3054383"), true);
  assert.equal(containerCheckDigitValid("CSQU3054384"), false);
});

test("Indian date format DD/MM/YYYY", () => {
  assert.equal(parseDate("02/10/2026"), "2026-10-02");
  assert.equal(parseDate("8 Oct 2026"), "2026-10-08");
});

test("heuristic extraction of the sample invoice", () => {
  const doc = extractHeuristic(readFileSync("samples/clean/01-commercial-invoice.txt", "utf8"));
  assert.equal(doc.docType, "commercial_invoice");
  assert.equal(doc.documentNumber, "SKW/EXP/2026/0418");
  assert.equal(doc.totalValue, 38550);
  assert.equal(doc.currency, "USD");
  assert.equal(doc.lineItems.length, 3);
  assert.equal(doc.lineItems[2].hsCode, "62052000");
});

test("clean set has no critical or major findings", async () => {
  const r = await runCheck("clean", load("clean"), { forceOffline: true });
  const serious = r.findings.filter((f) => f.severity === "critical" || f.severity === "major");
  assert.deepEqual(serious.map((f) => f.title), []);
  assert.equal(r.riskLevel, "low");
});

test("discrepant set catches every planted error", async () => {
  const r = await runCheck("bad", load("discrepant"), { forceOffline: true });
  const rules = new Set(r.findings.map((f) => f.ruleId));
  const expected = {
    "FMT-002": "GSTIN malformed",
    "ARI-001": "line amount arithmetic",
    "XDC-001": "consignee name mismatch",
    "XDC-009": "package count mismatch",
    "XDC-010": "gross weight mismatch",
    "XDC-004": "port of discharge mismatch",
    "XDC-022": "HS code differs across docs",
    "FMT-003": "container check digit",
    "LC-001": "shipment after L/C latest date",
    "LC-007": "B/L port vs L/C",
    "DAT-002": "COO dated after shipment",
    "HS-010": "woven shirt declared under knitted heading",
  };
  const missing = Object.entries(expected).filter(([id]) => !rules.has(id)).map(([, why]) => why);
  assert.deepEqual(missing, []);
  assert.equal(r.riskLevel, "high");
  assert.equal(r.status, "issues_found");
});
