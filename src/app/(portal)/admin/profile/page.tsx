import { PageHeader, Panel } from "@/components/ui/page";
import { Field, Submit } from "@/components/ui/auth-card";
import { requireSession } from "@/modules/platform/auth/application/session";
import { updateProfileAction } from "@/modules/platform/auth/application/actions";
export default async function Profile() {
  const ctx = await requireSession();
  return (
    <>
      <PageHeader
        title="Mi perfil"
        description="Actualiza tus datos personales. El rol y las unidades solo pueden ser administrados por usuarios autorizados."
      />
      <Panel className="max-w-xl">
        <form action={updateProfileAction} className="space-y-4">
          <Field
            label="Nombre"
            name="first_name"
            defaultValue={ctx.profile.first_name}
          />
          <Field
            label="Apellido"
            name="last_name"
            defaultValue={ctx.profile.last_name}
          />
          <Field
            label="Teléfono"
            name="phone"
            required={false}
            defaultValue={ctx.profile.phone ?? ""}
          />
          <Submit>Guardar perfil</Submit>
        </form>
        <p className="mt-5 text-xs text-[#718078]">
          La foto y preferencias visuales se incorporarán cuando exista
          almacenamiento dedicado en el modelo aprobado.
        </p>
      </Panel>
    </>
  );
}
