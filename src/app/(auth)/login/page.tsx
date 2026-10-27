import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard, Field, Submit } from "@/components/ui/auth-card";
import { loginAction } from "@/modules/platform/auth/application/actions";
/**
 * Quien abre /hostales sin sesión llega aquí con ?next=/hostales. Si en ese momento agrega la página a la
 * pantalla de inicio, debe quedar la app «Oasis Hostales» y no la de operaciones (manifiesto de todo el sitio).
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}): Promise<Metadata> {
  const { next } = await searchParams;
  if (typeof next === "string" && /^\/hostales(?:[/?#]|$)/.test(next))
    return {
      title: "Oasis Hostales",
      manifest: "/hostales.webmanifest",
      appleWebApp: { capable: true, title: "Oasis Hostales", statusBarStyle: "default" },
    };
  return {};
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const q = await searchParams;
  return (
    <AuthCard
      title="Bienvenido"
      description="Ingresa con tu cuenta corporativa para acceder a OASIS ERP."
    >
      {q.error && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {q.error}
        </p>
      )}
      <form action={loginAction} className="space-y-4">
        {q.next && <input type="hidden" name="next" value={q.next} />}
        <Field label="Correo" name="email" type="email" />
        <Field label="Contraseña" name="password" type="password" />
        <Submit>Iniciar sesión</Submit>
      </form>
      <Link
        className="mt-5 block text-center text-sm font-medium text-[#0b4f9c]"
        href="/forgot-password"
      >
        ¿Olvidaste tu contraseña?
      </Link>
    </AuthCard>
  );
}
