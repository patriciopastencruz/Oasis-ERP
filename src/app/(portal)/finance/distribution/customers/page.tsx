/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import {
  Flash,
  buttonClass,
  inputClass,
} from "@/components/finance/distribution/module-nav";
import { PageHeader, Panel } from "@/components/ui/page";
import { createCustomerAction } from "@/modules/finance/distribution/application/actions";
import { distributionContext } from "@/modules/finance/distribution/application/queries";
export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await distributionContext();
  const [{ data: classes }, { data: customers }] = await Promise.all([
    supabase
      .from("dist_customer_classifications")
      .select("id,name")
      .eq("business_unit_id", unit.id)
      .eq("active", true)
      .order("display_order"),
    supabase
      .from("dist_customers")
      .select("*,dist_customer_classifications(name)")
      .eq("business_unit_id", unit.id)
      .is("deleted_at", null)
      .order("name"),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Clientes"
        description="Maestro de clientes, clasificación y condiciones de crédito."
      />
      <Flash success={q.success} error={q.error} />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 font-semibold">Nuevo cliente</h2>
          <form action={createCustomerAction} className="space-y-3">
            <label className="block text-sm">
              Nombre
              <input className={inputClass} name="name" required />
            </label>
            <label className="block text-sm">
              Dirección
              <input className={inputClass} name="address" required />
            </label>
            <label className="block text-sm">
              Teléfono
              <input className={inputClass} name="phone" required />
            </label>
            <label className="block text-sm">
              Correo
              <input className={inputClass} name="email" type="email" />
            </label>
            <label className="block text-sm">
              Clasificación
              <select className={inputClass} name="classification_id" required>
                {classes?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Estado
              <select className={inputClass} name="status">
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="suspended">Suspendido</option>
              </select>
            </label>
            <label className="flex gap-2 text-sm">
              <input type="checkbox" name="has_credit" />
              Tiene crédito autorizado
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                Límite
                <input
                  className={inputClass}
                  name="credit_limit"
                  type="number"
                  min="0"
                  defaultValue="0"
                />
              </label>
              <label className="text-sm">
                Días
                <input
                  className={inputClass}
                  name="credit_days"
                  type="number"
                  min="0"
                  defaultValue="0"
                />
              </label>
            </div>
            <button className={buttonClass}>Crear cliente</button>
          </form>
        </Panel>
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Código</th>
                <th>Cliente</th>
                <th>Clasificación</th>
                <th>Estado</th>
                <th>Crédito</th>
                <th>Estado de pago</th>
              </tr>
            </thead>
            <tbody>
              {customers?.map((x: any) => (
                <tr key={x.id} className="border-b">
                  <td className="p-2 font-mono text-xs">{x.code}</td>
                  <td>
                    <b>{x.name}</b>
                    <br />
                    <span className="text-xs text-[#718078]">
                      {x.address} · {x.phone}
                    </span>
                  </td>
                  <td>{x.dist_customer_classifications?.name}</td>
                  <td>{x.status}</td>
                  <td>
                    {x.has_credit
                      ? `${Number(x.credit_limit).toLocaleString("es-CL")} / ${x.credit_days} días`
                      : "No"}
                  </td>
                  <td>
                    {ctx.permissions.has(
                      "finance.distribution.reports.export",
                    ) && (
                      <Link
                        className="font-medium text-[#176b46] underline"
                        href={`/api/finance/distribution/statement.pdf?customer=${x.id}`}
                      >
                        Descargar PDF
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
