import Link from "next/link";
import {
  Flash,
  buttonClass,
  inputClass,
} from "@/components/finance/distribution/module-nav";
import { PageHeader, Panel } from "@/components/ui/page";
import { closeDayAction } from "@/modules/finance/distribution/application/actions";
import {
  clp,
  dailyDistributionData,
} from "@/modules/finance/distribution/application/queries";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const date =
    q.date ??
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const d = await dailyDistributionData(date);
  const rows = [
    ["Venta planificada", clp.format(d.summary.planned_sales ?? 0)],
    ["Venta entregada", clp.format(d.summary.delivered_sales ?? 0)],
    ["Total cobrado", clp.format(d.summary.collected ?? 0)],
    ["Efectivo planificado", clp.format(d.summary.cash ?? 0)],
    ["Transferencia planificada", clp.format(d.summary.transfer ?? 0)],
    ["Crédito", clp.format(d.summary.credit ?? 0)],
    ["Pedidos entregados", d.summary.delivered ?? 0],
    ["Entregas parciales", d.summary.partial ?? 0],
    ["No entregados", d.summary.not_delivered ?? 0],
    ["Kilos de hielo", `${d.summary.ice_kg ?? 0} kg`],
    ["Unidades de agua", d.summary.water_units ?? 0],
  ];
  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Cierre diario y reportes"
        description="Resumen calculado desde pedidos, entregas y cobros; excluye anulados."
      />
      <Flash success={q.success} error={q.error} />
      <Panel className="mb-5">
        <form className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Fecha
            <input
              className={inputClass}
              type="date"
              name="date"
              defaultValue={date}
            />
          </label>
          <button className={buttonClass}>Consultar</button>
          <Link
            href={`/api/finance/distribution/reports.xlsx?date=${date}`}
            className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
          >
            Exportar Excel
          </Link>
        </form>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Panel>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-[#f8faf9] p-4">
                <p className="text-xs uppercase text-[#718078]">{label}</p>
                <p className="mt-2 text-xl font-bold">{value}</p>
              </div>
            ))}
          </div>
        </Panel>
        {d.ctx.permissions.has("finance.distribution.closures.manage") && (
          <Panel>
            <h2 className="font-semibold">Cierre formal</h2>
            <p className="my-3 text-sm text-[#718078]">
              Congela un snapshot auditable y bloquea modificaciones normales
              del {date}.
            </p>
            <form action={closeDayAction}>
              <input type="hidden" name="date" value={date} />
              <button className={buttonClass}>Cerrar jornada</button>
            </form>
          </Panel>
        )}
      </div>
    </>
  );
}
