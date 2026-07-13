import { AuthCard, Field, Submit } from "@/components/ui/auth-card";
import { recoverPasswordAction } from "@/modules/platform/auth/application/actions";
export default async function Forgot({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const q = await searchParams;
  return (
    <AuthCard
      title="Recuperar acceso"
      description="Te enviaremos un enlace seguro para establecer una nueva contraseña."
    >
      {q.sent ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
          Si el correo existe, recibirás las instrucciones.
        </p>
      ) : (
        <form action={recoverPasswordAction} className="space-y-4">
          <Field label="Correo" name="email" type="email" />
          <Submit>Enviar enlace</Submit>
        </form>
      )}
    </AuthCard>
  );
}
