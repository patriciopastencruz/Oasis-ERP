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
];
export async function proxy(request: NextRequest) {
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
