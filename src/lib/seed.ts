import { promises as fs } from "fs";
import path from "path";
import { defaultFor } from "@/lib/factors";
import { ingest } from "@/lib/pipeline";
import { DEFAULT_SETTINGS, audit, newId, newToken } from "@/lib/store";
import type { Db, Lang, Precursor, Product, Supplier } from "@/lib/types";

export function blankSupplier(input: { name: string; city: string; state: string; contactName: string; phone: string; language: Lang }): Supplier {
  return {
    id: newId(),
    ...input,
    status: "invited",
    createdAt: new Date().toISOString(),
    submittedAt: null,
    portalToken: newToken(),
    verifierToken: newToken(),
    passportToken: newToken(),
    products: [],
    evidence: [],
    activity: [],
    comments: [],
    verification: null,
    sharedWith: [],
  };
}

export function precursorFromDefault(name: string, cnCode: string, source: Precursor["source"] = "default"): Precursor {
  const d = defaultFor(cnCode);
  return { id: newId(), name, cnCode, seeDirect: d?.direct ?? 0, seeIndirect: d?.indirect ?? 0, source };
}

async function loadSamples(dir: string) {
  const full = path.join(process.cwd(), "samples", dir);
  const names = (await fs.readdir(full)).filter((n) => n.endsWith(".txt")).sort();
  return Promise.all(names.map(async (name) => ({ name, mimeType: "text/plain", data: await fs.readFile(path.join(full, name)) })));
}

/** Build the demo workspace: a fastener/wire-rod/aluminium cluster with planted data problems. */
export async function buildDemoDb(): Promise<Db> {
  const db: Db = { version: 1, settings: { ...DEFAULT_SETTINGS, exporterName: "Demo Exports Pvt Ltd" }, suppliers: [], audit: [] };

  // 1. Upstream wire-rod mill: clean data, confirmed.
  const shakti = blankSupplier({ name: "Shakti Wire Rod Mills Pvt Ltd", city: "Mandi Gobindgarh", state: "Punjab", contactName: "R. Garg", phone: "+919800000001", language: "pa" });
  const rod: Product = {
    id: newId(),
    name: "Wire rod",
    cnCode: "7213 91 10",
    route: "steel_induction",
    euTonnesPerYear: 3000,
    precursors: [
      { id: newId(), name: "Steel scrap", cnCode: "7204", seeDirect: 0, seeIndirect: 0, source: "actual" },
      precursorFromDefault("Sponge iron", "7203 10 00"),
    ],
  };
  shakti.products.push(rod);

  // 2. Fastener maker: buys rod from Shakti (multi-tier passport link) with planted problems.
  const lpf = blankSupplier({ name: "Ludhiana Precision Fasteners", city: "Ludhiana", state: "Punjab", contactName: "Harpreet Singh", phone: "+919800000002", language: "hi" });
  const rodLink = (): Precursor => ({ ...precursorFromDefault("Wire rod", "7213 91 10", "passport"), linkedSupplierId: shakti.id, linkedProductId: rod.id });
  lpf.products.push(
    { id: newId(), name: "Hex bolts", cnCode: "7318 15 88", route: "steel_fasteners", euTonnesPerYear: 1800, precursors: [rodLink()] },
    { id: newId(), name: "Hex nuts", cnCode: "7318 16 91", route: "steel_fasteners", euTonnesPerYear: 600, precursors: [rodLink()] },
  );

  // 3. Aluminium extruder: colony meter included, solar claimed, billets on defaults.
  const gae = blankSupplier({ name: "Gujarat Alu Extrusions LLP", city: "Sanand", state: "Gujarat", contactName: "Mehul Patel", phone: "+919800000003", language: "gu" });
  gae.products.push({ id: newId(), name: "Aluminium window profiles", cnCode: "7604 29 10", route: "al_extrusion", euTonnesPerYear: 1200, precursors: [precursorFromDefault("Aluminium billets", "7601 20 20")] });

  // 4. Invited, nothing uploaded yet.
  const sbc = blankSupplier({ name: "Sri Balaji Cement Grinding Unit", city: "Hosur", state: "Tamil Nadu", contactName: "K. Murugan", phone: "+919800000004", language: "ta" });
  sbc.products.push({ id: newId(), name: "Portland slag cement", cnCode: "2523 29 00", route: "cement_grinding", euTonnesPerYear: 5000, precursors: [precursorFromDefault("Clinker", "2523 10 00")] });

  for (const [s, dir] of [[shakti, "shakti"], [lpf, "ludhiana"], [gae, "gujarat"]] as const) {
    for (const f of await loadSamples(dir)) await ingest(s, f, "supplier", { forceOffline: true });
  }
  shakti.activity.forEach((r) => (r.confirmed = true));
  shakti.status = "submitted";
  shakti.submittedAt = "2026-10-12T10:00:00.000Z";
  shakti.sharedWith = ["Demo Exports Pvt Ltd", "Ludhiana Precision Fasteners"];
  lpf.status = "submitted";
  lpf.submittedAt = "2026-10-20T09:30:00.000Z";
  gae.status = "collecting";

  db.suppliers.push(shakti, lpf, gae, sbc);
  for (const s of db.suppliers) audit(db, "system", "supplier_created", `${s.name} (demo)`, s.id);
  for (const s of db.suppliers) for (const e of s.evidence) audit(db, "supplier", "evidence_uploaded", `${e.fileName} sha256=${e.sha256.slice(0, 16)}…`, s.id);
  return db;
}
