import { json } from "@/lib/api";
import { buildDemoDb } from "@/lib/seed";
import { mutate } from "@/lib/store";

/** Replace everything with the demo workspace. */
export async function POST() {
  const demo = await buildDemoDb();
  await mutate((db) => {
    Object.assign(db, demo);
  });
  return json({ ok: true });
}
