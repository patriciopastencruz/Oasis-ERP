import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
const PUBLIC = [
  "/login",
  "/forgot-password",
  "/auth/callback",
  "/setup",
  // Página pública de reserva de Hostal Uruguay (sin sesión, ver
  // src/app/(public)/reservar/hostal-uruguay/page.tsx).
  "/reservar",
  // Calendario de solo lectura para familiares sin cuenta en el ERP,
  // protegido por token opaco en la URL en vez de sesión (ver
  // src/app/(public)/calendario/[token]/page.tsx).
  "/calendario",
];
// El dominio propio (oasis-erp.cl) reemplazó a la URL de Vercel como
// dirección oficial. Quien entre por el link antiguo ve un aviso con botón
// hacia la nueva dirección en vez de la app -- nunca un redirect automático,
// para que el cambio de dominio quede claro para quien lo visita.
const OLD_PROD_HOST = "oasis-erp.vercel.app";
const NEW_PROD_HOST = "oasis-erp.cl";
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function oldDomainNoticeHtml(newUrl: string) {
  const safeUrl = escapeHtml(newUrl);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cambiamos de dirección</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; font-family:system-ui,sans-serif; background:#faf6ef; color:#241c16; padding:2rem; }
  .box { max-width:420px; text-align:center; }
  h1 { font-size:1.4rem; margin:0 0 0.75rem; }
  p { color:#6b5d4f; margin:0 0 1.5rem; }
  a.btn { display:inline-block; background:#c1652f; color:#fff; text-decoration:none; font-weight:600; padding:0.75rem 1.5rem; border-radius:999px; }
  a.btn:hover { background:#a4531f; }
</style>
</head>
<body>
  <div class="box">
    <h1>Nos cambiamos de dirección</h1>
    <p>Este link ya no se usa. Haz clic para continuar en nuestra dirección oficial.</p>
    <a class="btn" href="${safeUrl}">Ir a ${escapeHtml(NEW_PROD_HOST)}</a>
  </div>
</body>
</html>`;
}
export async function proxy(request: NextRequest) {
  if (request.headers.get("host") === OLD_PROD_HOST) {
    const newUrl = `https://${NEW_PROD_HOST}${request.nextUrl.pathname}${request.nextUrl.search}`;
    return new NextResponse(oldDomainNoticeHtml(newUrl), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isPublic = PUBLIC.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );
  if (!user && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(target);
  }
  if (user && request.nextUrl.pathname === "/login")
    return NextResponse.redirect(new URL("/dashboard", request.url));
  return response;
}
export const config = {
  matcher: [
    // Las rutas /api/* siempre validan su propia autenticación (sesión,
    // permiso, secreto Bearer o firma de webhook) -- ver session.ts,
    // api/cron/lodging-ical/route.ts, api/whatsapp/webhook/route.ts. El
    // proxy nunca debe interceptarlas: hacerlo redirige a /login (que
    // exige cookies de navegador) a llamadores externos sin sesión, como
    // Twilio o los cron de Vercel, rompiendo esas rutas por completo.
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
