import Link from "next/link";
import { AuthCard, Field, Submit } from "@/components/ui/auth-card";
import { loginAction } from "@/modules/platform/auth/application/actions";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
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
        <Field label="Correo" name="email" type="email" />
        <Field label="Contraseña" name="password" type="password" />
        <Submit>Iniciar sesión</Submit>
      </form>
      <Link
        className="mt-5 block text-center text-sm font-medium text-[#277a55]"
        href="/forgot-password"
      >
        ¿Olvidaste tu contraseña?
      </Link>
    </AuthCard>
  );
}
