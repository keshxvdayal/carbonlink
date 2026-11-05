import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { computeInstallation, fuelEmissions } from "@/lib/calc";
import { extractHeuristic, parseDate } from "@/lib/extract/heuristic";
import { defaultFor } from "@/lib/factors";
import { monthsCovered } from "@/lib/flags";
import { supplierResult } from "@/lib/pipeline";
import { buildDemoDb } from "@/lib/seed";
import { simulateYear } from "@/lib/simulator";
import { audit, verifyAuditChain } from "@/lib/store";
import type { Db } from "@/lib/types";

const approx = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test("fuel factors: diesel ≈ 2.65 kgCO2/L, furnace oil ≈ 2.97 kgCO2/L, PNG ≈ 2.02 kgCO2/SCM", () => {
  approx(fuelEmissions("diesel", 1000, "L")!.tco2, 2.651);
  approx(fuelEmissions("furnace_oil", 1, "kL")!.tco2, 2.971);
  approx(fuelEmissions("natural_gas", 1000, "SCM")!.tco2, 2.02);
  assert.equal(fuelEmissions("diesel", 5, "kg"), null, "incompatible units are rejected, not guessed");
});

test("dates and months", () => {
  assert.equal(parseDate("01/07/2026"), "2026-07-01");
  assert.deepEqual(monthsCovered({ periodStart: "2026-07-01", periodEnd: "2026-09-30" }), ["2026-07", "2026-08", "2026-09"]);
});

test("offline extraction of an electricity bill with solar", () => {
  const doc = extractHeuristic(readFileSync("samples/gujarat/elec-main-2026-08.txt", "utf8"));
  assert.equal(doc.docType, "electricity_bill");
  assert.equal(doc.accountRef, "41207/HT/0388");
  assert.deepEqual(doc.lines.map((l) => [l.kind, l.quantity, l.unit]), [["electricity", 131400, "kWh"], ["renewable_electricity", 15200, "kWh"]]);
});

test("default lookup uses longest CN prefix and overrides win", () => {
  assert.equal(defaultFor("7318 15 88")!.key, "7318");
  assert.equal(defaultFor("2523 10 00")!.key, "252310");
  assert.equal(defaultFor("7318 15 88", { "731815": { direct: 9, indirect: 1 } })!.direct, 9);
});

test("demo: clean wire-rod mill computes the hand-checked SEE", async () => {
  const db = await buildDemoDb();
  const shakti = db.suppliers[0];
  const inst = computeInstallation(shakti, db.settings);
  // FO 110,400 L × 2.971 kg/L + HSD 6,200 L × 2.651 kg/L
  approx(inst.directTotal, 110.4 * 2.9714 + 6.2 * 2.6511, 0.005);
  approx(inst.electricityMWh, 3690);
  const rod = inst.products[0];
  approx(rod.outputTonnes, 4512.4);
  // precursor: 1,705 t sponge iron × 2.9 default; scrap is zero
  approx(rod.precursorDirect, 1705 * 2.9);
  approx(rod.seeDirect, (inst.directTotal + 1705 * 2.9) / 4512.4);
  const { flags, score } = supplierResult(db, shakti);
  assert.ok(!flags.some((f) => f.severity === "critical" || f.severity === "major"), JSON.stringify(flags.map((f) => f.title)));
  assert.ok(score.quality >= 80);
});

test("demo: every planted problem is caught", async () => {
  const db = await buildDemoDb();
  const rules = (i: number) => new Set(supplierResult(db, db.suppliers[i]).flags.map((f) => f.rule));
  const lpf = rules(1);
  for (const r of ["R05", "R07", "R08"]) assert.ok(lpf.has(r), `fasteners missing ${r}`);
  const gae = rules(2);
  for (const r of ["R03", "R11", "R15", "R17"]) assert.ok(gae.has(r), `aluminium missing ${r}`);
  const sbc = rules(3);
  for (const r of ["R01", "R02"]) assert.ok(sbc.has(r), `cement missing ${r}`);
});

test("multi-tier: fastener precursor resolves to the rod mill's actual SEE, not the default", async () => {
  const db = await buildDemoDb();
  const rodSee = supplierResult(db, db.suppliers[0]).inst.products[0].seeDirect;
  const bolts = supplierResult(db, db.suppliers[1]).inst.products[0];
  assert.ok(rodSee < 3.1);
  assert.ok(bolts.precursorDirect > 0);
  approx(bolts.precursorDirect, 728 * rodSee, 0.001);
});

test("simulator: saving equals emissions avoided × price, independent of the benchmark", () => {
  const base = { sector: "iron_steel" as const, tonnes: 1000, seeActual: 1.5, seeDefault: 3.0, etsPriceEur: 80, originCarbonPriceEur: 0 };
  const y = simulateYear(base, 2026);
  approx(y.defaultWithMarkup, 3.3);
  approx(y.savingEur, (3.3 - 1.5) * 1000 * 80);
  const y2 = simulateYear({ ...base, benchmark: 0.5 }, 2026);
  approx(y2.savingEur, y.savingEur);
  // below the benchmark deduction nothing is owed
  assert.equal(simulateYear({ ...base, seeActual: 0.5 }, 2026).certsPerTActual, 0);
});

test("audit chain detects tampering", () => {
  const db: Db = { version: 1, settings: {} as Db["settings"], suppliers: [], audit: [] };
  audit(db, "a", "x", "one");
  audit(db, "a", "y", "two");
  audit(db, "a", "z", "three");
  assert.equal(verifyAuditChain(db.audit).ok, true);
  db.audit[1].detail = "edited";
  assert.deepEqual(verifyAuditChain(db.audit), { ok: false, brokenAt: 2 });
});

test("simulator: actuals worse than the default fall back to the default (no negative saving)", () => {
  const y = simulateYear({ sector: "iron_steel", tonnes: 100, seeActual: 9, seeDefault: 3, etsPriceEur: 80, originCarbonPriceEur: 0 }, 2027);
  assert.equal(y.savingEur, 0);
  assert.equal(y.costActualEur, y.costDefaultEur);
});
