import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processLuciaConversation } from "@/modules/lucia/application/process";

export const runtime = "nodejs";
export const maxDuration = 60;

// Lo llama solo el worker de WhatsApp (Railway) con LUCIA_WORKER_SECRET.
function authorized(request: Request) {
  const expected = process.env.LUCIA_WORKER_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!expected || expected.length < 32) return false;
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

const bodySchema = z.object({ conversation_id: z.string().uuid() });

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const result = await processLuciaConversation(
    createSupabaseAdminClient(),
    parsed.data.conversation_id,
  );
  return Response.json(result, { status: result.status === "error" ? 502 : 200 });
}
