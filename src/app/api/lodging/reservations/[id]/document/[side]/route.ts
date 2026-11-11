import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function onlineDocumentPath(supabase: Supabase, id: string, side: string) {
  const { data: link } = await supabase
    .from("lodging_checkin_links")
    .select("document_front_path,document_back_path")
    .eq("reservation_id", id)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return side === "front" ? link?.document_front_path : link?.document_back_path;
}

async function staffDocumentPath(supabase: Supabase, id: string, side: string) {
  const { data } = await supabase
    .from("lodging_reservation_documents")
    .select("front_path,back_path")
    .eq("reservation_id", id)
    .maybeSingle();
  return side === "front" ? data?.front_path : data?.back_path;
}

/**
 * Foto del documento del check-in online (o la cargada por recepción con ?from=staff). Dirección fija (sin vencimiento) que
 * solo responde con sesión y permiso de ver reservas; la lectura del archivo
 * pasa por la política del bucket privado (acceso al hostal de la reserva).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; side: string }> }) {
  await requirePermission("lodging.reservations.view");
  const { id, side } = await params;
  if (!z.string().uuid().safeParse(id).success || !["front", "back"].includes(side))
    return new NextResponse("No encontrado", { status: 404 });
  const supabase = await createSupabaseServerClient();
  // ?from=staff: foto cargada por recepción al crear la reserva; sin parámetro, la del check-in online del huésped.
  const path =
    new URL(request.url).searchParams.get("from") === "staff"
      ? await staffDocumentPath(supabase, id, side)
      : await onlineDocumentPath(supabase, id, side);
  if (!path) return new NextResponse("No encontrado", { status: 404 });
  const { data: file, error } = await supabase.storage.from("lodging-guest-documents").download(path);
  if (error || !file) return new NextResponse("No encontrado", { status: 404 });
  return new NextResponse(file, {
    headers: {
      "Content-Type": file.type || "image/jpeg",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
