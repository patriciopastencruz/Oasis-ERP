import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidSlug, sharedPageHeaders } from "@/modules/sales/shared-pages/domain/shared-pages";

export const dynamic = "force-dynamic";

const notFoundHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página no disponible</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#faf6ef;color:#241c16"><p>Esta página no está disponible.</p></body></html>`;

function notFound() {
  return new Response(notFoundHtml, {
    status: 404,
    headers: { ...sharedPageHeaders(), "Cache-Control": "no-store" },
  });
}

/**
 * Página compartida de Oasis Modulares (archivo .html subido desde el ERP), pública y sin sesión.
 * Se lee con la clave de servicio porque quien abre el enlace no inicia sesión; solo se entrega si está activa.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) return notFound();
  const admin = createSupabaseAdminClient();
  const { data: page } = await admin
    .from("om_shared_pages")
    .select("id")
    .eq("slug", slug)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!page) return notFound();
  const { data: content } = await admin.from("om_shared_page_contents").select("html").eq("page_id", page.id).maybeSingle();
  if (!content?.html) return notFound();
  return new Response(content.html, { status: 200, headers: sharedPageHeaders() });
}
