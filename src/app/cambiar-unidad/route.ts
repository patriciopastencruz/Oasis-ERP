import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/modules/platform/auth/application/session";

/**
 * Cambia la unidad activa y sigue a una pantalla. Lo usa el resumen ejecutivo para que sus enlaces
 * («Ver cotizaciones») abran el módulo con el menú de la unidad correcta y no con la última elegida.
 * Solo acepta unidades del usuario y rutas internas.
 */
export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));
  const code = request.nextUrl.searchParams.get("unidad") ?? "";
  const to = request.nextUrl.searchParams.get("a") ?? "/";
  const target = to.startsWith("/") && !to.startsWith("//") ? to : "/";
  const unit = ctx.units.find((u) => u.code === code);
  if (unit) {
    const store = await cookies();
    const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };
    store.set("oasis_company", unit.company_id, options);
    store.set("oasis_unit", unit.id, options);
  }
  return NextResponse.redirect(new URL(target, request.url));
}
