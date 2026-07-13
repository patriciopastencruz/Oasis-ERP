import { AuthCard, Field, Submit } from "@/components/ui/auth-card";
import { updatePasswordAction } from "@/modules/platform/auth/application/actions";
export default async function UpdatePassword({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
  return (
    <AuthCard
      title="Nueva contraseña"
      description="Usa al menos ocho caracteres."
    >
      {q.error && <p className="mb-4 text-sm text-red-700">{q.error}</p>}
      <form action={updatePasswordAction} className="space-y-4">
        <Field label="Contraseña" name="password" type="password" />
        <Submit>Guardar contraseña</Submit>
      </form>
    </AuthCard>
  );
}
