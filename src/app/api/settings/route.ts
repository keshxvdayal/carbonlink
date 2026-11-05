import { json } from "@/lib/api";
import { audit, mutate, readDb } from "@/lib/store";
import type { Settings } from "@/lib/types";

export async function GET() {
  return json((await readDb()).settings);
}

const NUM: (keyof Settings)[] = ["reportingYear", "etsPriceEur", "eurInr", "gridEf", "originCarbonPriceEur"];

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<Settings> | null;
  if (!body) return json({ error: "Expected JSON" }, 400);
  const next = await mutate((db) => {
    const s = db.settings;
    if (typeof body.exporterName === "string" && body.exporterName.trim()) s.exporterName = body.exporterName.trim().slice(0, 120);
    for (const k of NUM) {
      const v = Number(body[k]);
      if (body[k] !== undefined && Number.isFinite(v) && v >= 0) (s as Record<string, unknown>)[k] = v;
    }
    if (body.defaultOverrides && typeof body.defaultOverrides === "object") {
      const clean: Settings["defaultOverrides"] = {};
      for (const [k, v] of Object.entries(body.defaultOverrides)) {
        const key = k.replace(/\D/g, "");
        if (key.length >= 4 && Number.isFinite(Number(v?.direct)) && Number.isFinite(Number(v?.indirect))) clean[key] = { direct: Number(v.direct), indirect: Number(v.indirect) };
      }
      s.defaultOverrides = clean;
    }
    audit(db, "exporter", "settings_changed", JSON.stringify({ ...s, defaultOverrides: Object.keys(s.defaultOverrides).length }));
    return s;
  });
  return json(next);
}
