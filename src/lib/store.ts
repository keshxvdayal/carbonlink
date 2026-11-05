import { createHash, randomBytes, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { GRID_EF_DEFAULT } from "@/lib/factors";
import type { AuditEntry, Db, Settings, Supplier } from "@/lib/types";

/**
 * JSON-file store: ./data/db.json plus original evidence files under
 * ./data/evidence/<sha256>. Writes are serialized through one promise chain.
 * Good for a pilot on one machine; move to Postgres + object storage + auth
 * before more than one exporter uses it.
 */
const DATA_DIR = process.env.CARBONLINK_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const EVIDENCE_DIR = path.join(DATA_DIR, "evidence");

export const DEFAULT_SETTINGS: Settings = {
  exporterName: "Your company (exporter)",
  reportingYear: 2026,
  etsPriceEur: 75,
  eurInr: 100,
  gridEf: GRID_EF_DEFAULT,
  originCarbonPriceEur: 0,
  defaultOverrides: {},
};

const empty = (): Db => ({ version: 1, settings: { ...DEFAULT_SETTINGS }, suppliers: [], audit: [] });

let queue: Promise<unknown> = Promise.resolve();

export async function readDb(): Promise<Db> {
  try {
    const db = JSON.parse(await fs.readFile(DB_FILE, "utf8")) as Db;
    db.settings = { ...DEFAULT_SETTINGS, ...db.settings };
    return db;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw err;
  }
}

async function writeDb(db: Db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_FILE);
}

/** Run a read-modify-write transaction. Only one runs at a time. */
export function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

/* ------------------------------------------------------------------ *
 * Hash-chained audit log: each entry's hash covers the previous hash, *
 * so editing or deleting any past entry breaks every later hash.      *
 * ------------------------------------------------------------------ */
export function auditHash(e: Omit<AuditEntry, "hash">): string {
  return createHash("sha256")
    .update(JSON.stringify([e.seq, e.at, e.actor, e.action, e.detail, e.supplierId, e.prevHash]))
    .digest("hex");
}

export function audit(db: Db, actor: string, action: string, detail: string, supplierId: string | null = null) {
  const prev = db.audit[db.audit.length - 1];
  const entry: Omit<AuditEntry, "hash"> = {
    seq: (prev?.seq ?? 0) + 1,
    at: new Date().toISOString(),
    actor,
    action,
    detail: detail.slice(0, 500),
    supplierId,
    prevHash: prev?.hash ?? "0".repeat(64),
  };
  db.audit.push({ ...entry, hash: auditHash(entry) });
}

export function verifyAuditChain(entries: AuditEntry[]): { ok: boolean; brokenAt: number | null } {
  let prev = "0".repeat(64);
  for (const e of entries) {
    const { hash, ...rest } = e;
    if (e.prevHash !== prev || auditHash(rest) !== hash) return { ok: false, brokenAt: e.seq };
    prev = hash;
  }
  return { ok: true, brokenAt: null };
}

/* ------------------------------------------------------------------ *
 * Evidence files                                                      *
 * ------------------------------------------------------------------ */
export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function saveEvidenceFile(data: Buffer): Promise<string> {
  const hash = sha256(data);
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, hash);
  await fs.writeFile(file, data, { flag: "w" });
  return hash;
}

export async function readEvidenceFile(hash: string): Promise<Buffer | null> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  try {
    return await fs.readFile(path.join(EVIDENCE_DIR, hash));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Helpers                                                             *
 * ------------------------------------------------------------------ */
export const newId = () => randomUUID().slice(0, 8);
export const newToken = () => randomBytes(18).toString("base64url");

export function findSupplier(db: Db, id: string): Supplier | undefined {
  return db.suppliers.find((s) => s.id === id);
}

export function findByToken(db: Db, kind: "portalToken" | "verifierToken" | "passportToken", token: string): Supplier | undefined {
  if (!token || token.length < 16) return undefined;
  return db.suppliers.find((s) => s[kind] === token);
}

export async function resetDb(db: Db) {
  await mutate((cur) => {
    Object.assign(cur, db);
  });
}
