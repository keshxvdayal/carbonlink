import { connection } from "next/server";
import { aiEnabled, MODEL } from "@/lib/extract/claude";

export async function GET() {
  await connection(); // read env at request time, not at build time
  return Response.json({ ai: aiEnabled(), model: aiEnabled() ? MODEL : null });
}
