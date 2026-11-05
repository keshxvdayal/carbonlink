import { promises as fs } from "fs";
import path from "path";
import type { CheckResult } from "@/lib/types";

/**
 * Minimal JSON-file store: one file per check under ./data/checks.
 * Good enough for a pilot with a handful of customers. Swap for
 * Postgres before multi-user / multi-instance deployment.
 */
const DIR = path.join(process.cwd(), "data", "checks");
const SAFE_ID = /^[a-z0-9-]{1,64}$/i;

async function ensureDir() {
  await fs.mkdir(DIR, { recursive: true });
}

export async function saveCheck(check: CheckResult): Promise<void> {
  if (!SAFE_ID.test(check.id)) throw new Error("invalid id");
  await ensureDir();
  const file = path.join(DIR, `${check.id}.json`);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(check, null, 2));
  await fs.rename(tmp, file);
}

export async function getCheck(id: string): Promise<CheckResult | null> {
  if (!SAFE_ID.test(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

export async function listChecks(): Promise<CheckResult[]> {
  await ensureDir();
  const files = (await fs.readdir(DIR)).filter((f) => f.endsWith(".json"));
  const checks = await Promise.all(files.map(async (f) => JSON.parse(await fs.readFile(path.join(DIR, f), "utf8")) as CheckResult));
  return checks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteCheck(id: string): Promise<void> {
  if (!SAFE_ID.test(id)) return;
  await fs.rm(path.join(DIR, `${id}.json`), { force: true });
}
