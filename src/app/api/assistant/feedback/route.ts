import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/modules/platform/auth/application/session";

const bodySchema = z.object({
  messageId: z.string().uuid(),
  rating: z.enum(["helpful", "not_helpful"]),
  comment: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json(
      { error: "Debes iniciar sesión." },
      { status: 401 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("assistant_feedback").insert({
    message_id: parsed.data.messageId,
    user_id: session.user.id,
    rating: parsed.data.rating,
    comment: parsed.data.comment ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Ya evaluaste este mensaje." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "No fue posible registrar tu evaluación." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
