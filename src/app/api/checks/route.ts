import { promises as fs } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { ExtractionError, type UploadedFile } from "@/lib/extract/claude";
import { runCheck } from "@/lib/pipeline";
import { listChecks, saveCheck } from "@/lib/store";

export const maxDuration = 300;

const MAX_FILES = 15;
const MAX_BYTES = 20 * 1024 * 1024;
const SAMPLES = { clean: "Sample: clean shipment", discrepant: "Sample: shipment with errors" } as const;

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".txt": "text/plain",
  ".csv": "text/plain",
  ".md": "text/plain",
};

async function loadSample(set: keyof typeof SAMPLES): Promise<UploadedFile[]> {
  const dir = path.join(process.cwd(), "samples", set);
  const names = (await fs.readdir(dir)).sort();
  return Promise.all(names.map(async (name) => ({ name, mimeType: "text/plain", data: await fs.readFile(path.join(dir, name)) })));
}

export async function GET() {
  const checks = await listChecks();
  return Response.json(
    checks.map(({ id, name, createdAt, status, riskScore, riskLevel, docs, findings, mode }) => ({
      id, name, createdAt, status, riskScore, riskLevel, mode,
      docCount: docs.length,
      docTypes: docs.map((d) => d.data.docType),
      openFindings: findings.filter((f) => f.status === "open" && f.severity !== "info").length,
      counts: Object.fromEntries(
        (["critical", "major", "minor"] as const).map((s) => [s, findings.filter((f) => f.status === "open" && f.severity === s).length]),
      ),
    })),
  );
}

export async function POST(request: Request) {
  const form = await request.formData();
  const sample = form.get("sample");
  let files: UploadedFile[];
  let name = String(form.get("name") ?? "").trim();

  if (typeof sample === "string" && sample in SAMPLES) {
    files = await loadSample(sample as keyof typeof SAMPLES);
    name ||= SAMPLES[sample as keyof typeof SAMPLES];
  } else {
    const uploads = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!uploads.length) return Response.json({ error: "Upload at least one document." }, { status: 400 });
    if (uploads.length > MAX_FILES) return Response.json({ error: `Upload at most ${MAX_FILES} documents per check.` }, { status: 400 });
    const tooBig = uploads.find((f) => f.size > MAX_BYTES);
    if (tooBig) return Response.json({ error: `${tooBig.name} is larger than 20 MB.` }, { status: 400 });
    files = [];
    for (const f of uploads) {
      const ext = path.extname(f.name).toLowerCase();
      const mimeType = MIME_BY_EXT[ext];
      if (!mimeType) return Response.json({ error: `${f.name}: unsupported file type. Use PDF, PNG, JPG, WEBP or TXT.` }, { status: 400 });
      files.push({ name: f.name, mimeType, data: Buffer.from(await f.arrayBuffer()) });
    }
    name ||= `Check ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`;
  }

  try {
    const check = await runCheck(name, files, { forceOffline: form.get("offline") === "1" });
    await saveCheck(check);
    return Response.json({ id: check.id });
  } catch (err) {
    if (err instanceof ExtractionError) return Response.json({ error: err.message }, { status: 422 });
    if (err instanceof Anthropic.AuthenticationError) return Response.json({ error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." }, { status: 502 });
    if (err instanceof Anthropic.RateLimitError) return Response.json({ error: "AI rate limit reached. Try again in a minute." }, { status: 429 });
    if (err instanceof Anthropic.APIError) return Response.json({ error: `AI service error (${err.status ?? "network"}). Try again.` }, { status: 502 });
    if (err instanceof Error) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
