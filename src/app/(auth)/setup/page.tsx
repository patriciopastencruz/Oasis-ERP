import { AuthCard, Field, Submit } from "@/components/ui/auth-card";
import { bootstrapSuperadminAction } from "@/modules/platform/admin/application/actions";
export default async function Setup({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
  return (
    <AuthCard
      title="Inicializar OASIS ERP"
      description="Uso único: crea el primer Superadministrador y lo asigna a las unidades de negocio."
    >
      {q.error && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {q.error}
        </p>
      )}
      <form action={bootstrapSuperadminAction} className="space-y-4">
        <Field label="Nombre" name="first_name" />
        <Field label="Apellido" name="last_name" />
        <Field label="Correo" name="email" type="email" />
        <Field label="Contraseña inicial" name="password" type="password" />
        <Submit>Crear primer Superadministrador</Submit>
      </form>
      <p className="mt-4 text-xs text-[#63778e]">
        La operación se bloquea permanentemente cuando ya existe un perfil.
      </p>
    </AuthCard>
  );
}
