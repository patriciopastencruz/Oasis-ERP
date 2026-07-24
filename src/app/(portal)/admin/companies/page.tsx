import { PageHeader, Panel } from "@/components/ui/page";
import { Field, Submit } from "@/components/ui/auth-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import {
  saveCompanyAction,
  toggleCompanyAction,
} from "@/modules/platform/admin/application/actions";
import { redirect } from "next/navigation";

const accountTypes = [
  ["checking", "Cuenta corriente"],
  ["sight", "Cuenta vista"],
  ["savings", "Cuenta de ahorro"],
  ["rut", "Cuenta RUT"],
  ["other", "Otra"],
] as const;

function CompanyForm({ company }: { company?: Record<string, unknown> }) {
  return (
    <form action={saveCompanyAction} className="grid gap-3 md:grid-cols-2">
      {Boolean(company?.id) && (
        <input type="hidden" name="id" value={String(company?.id)} />
      )}
      <Field
        label="Código"
        name="code"
        defaultValue={String(company?.code ?? "")}
      />
      <Field label="RUT" name="rut" defaultValue={String(company?.rut ?? "")} />
      <Field
        label="Razón social"
        name="legal_name"
        defaultValue={String(company?.legal_name ?? "")}
      />
      <Field
        label="Nombre comercial"
        name="trade_name"
        defaultValue={String(company?.trade_name ?? "")}
      />
      <Field
        label="Banco"
        name="bank_name"
        defaultValue={String(company?.bank_name ?? "")}
      />
      <label className="block text-sm">
        Tipo de cuenta
        <select
          name="bank_account_type"
          defaultValue={String(company?.bank_account_type ?? "checking")}
          className="mt-2 w-full rounded-xl border p-3"
        >
          {accountTypes.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Número de cuenta"
        name="bank_account_number"
        defaultValue={String(company?.bank_account_number ?? "")}
      />
      <Field
        label="Titular de la cuenta"
        name="bank_account_holder_name"
        defaultValue={String(
          company?.bank_account_holder_name ?? company?.legal_name ?? "",
        )}
      />
      <Field
        label="RUT del titular"
        name="bank_account_holder_rut"
        defaultValue={String(
          company?.bank_account_holder_rut ?? company?.rut ?? "",
        )}
      />
      <Field
        label="Correo para comprobantes"
        name="bank_receipt_email"
        type="email"
        defaultValue={String(company?.bank_receipt_email ?? "")}
      />
      <input type="hidden" name="timezone" value="America/Santiago" />
      <input type="hidden" name="currency" value="CLP" />
      <div className="md:col-span-2">
        <Submit>{company ? "Guardar cambios" : "Crear empresa"}</Submit>
      </div>
    </form>
  );
}

export default async function Companies() {
  await requirePermission("administration.companies.manage");
  redirect("/admin/business-units");
  const s = await createSupabaseServerClient();
  const { data } = await s.from("companies").select("*").order("trade_name");
  return (
    <>
      <PageHeader
        title="Empresas"
        description="Administra la identificación y la cuenta bancaria principal de cada empresa."
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_430px]">
        <div className="space-y-4">
          {data?.map((c) => (
            <Panel key={c.id}>
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <b>{c.trade_name}</b>
                  <p className="text-sm text-slate-600">
                    {c.legal_name} · {c.rut}
                  </p>
                </div>
                <form action={toggleCompanyAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input
                    type="hidden"
                    name="active"
                    value={String(!c.active)}
                  />
                  <button className="text-xs font-semibold text-[#0b4f9c]">
                    {c.active ? "Desactivar" : "Activar"}
                  </button>
                </form>
              </div>
              <CompanyForm company={c} />
            </Panel>
          ))}
        </div>
        <Panel>
          <h2 className="mb-4 font-semibold">Nueva empresa</h2>
          <CompanyForm />
        </Panel>
      </div>
    </>
  );
}
