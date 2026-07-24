import Image from "next/image";
import { Activity, CircleDollarSign, Clock3, TrendingUp } from "lucide-react";
import { getBusinessUnitBrand } from "@/config/business-units";
import { Panel } from "@/components/ui/page";
import { executiveDashboardData } from "@/modules/executive-dashboard/application/queries";
import { uiLabel } from "@/lib/ui-labels";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const monthLabel = (value: string) =>
  new Intl.DateTimeFormat("es-CL", { month: "short", timeZone: "UTC" }).format(
    new Date(`${value}T12:00:00Z`),
  );

export default async function Dashboard() {
  const data = await executiveDashboardData();
  const brand = getBusinessUnitBrand(data.unit.code);
  const summaryCards = [
    [
      "Solicitado este mes",
      clp.format(Number(data.summary.total_requested ?? 0)),
      CircleDollarSign,
    ],
    [
      "Aprobado",
      clp.format(Number(data.summary.total_approved ?? 0)),
      TrendingUp,
    ],
    ["Pagado", clp.format(Number(data.summary.total_paid ?? 0)), Activity],
    ["Pendiente", clp.format(Number(data.summary.total_pending ?? 0)), Clock3],
  ] as const;
  const operationalCards =
    data.unit.code === "DA"
      ? [
          ["Pedidos de hoy", data.operations.orders_total ?? 0],
          ["Entregados", data.operations.delivered ?? 0],
          ["Pendientes", data.operations.pending ?? 0],
          ["Venta del día", clp.format(data.operations.planned_sales ?? 0)],
        ]
      : data.unit.code === "OM"
        ? [
            ["Materiales", data.operations.materials ?? 0],
            ["Stock disponible", data.operations.stock_units ?? 0],
            ["Valor del stock", clp.format(data.operations.stock_value ?? 0)],
            ["Salidas de hoy", data.operations.outputs_today ?? 0],
          ]
        : ["HOC", "HOB", "HU"].includes(data.unit.code)
          ? [
              ["Habitaciones", data.operations.rooms ?? 0],
              ["Ocupadas hoy", data.operations.occupied ?? 0],
              ["Disponibles", data.operations.available ?? 0],
              ["Ocupación", `${data.operations.occupancy ?? 0}%`],
            ]
          : [];
  const maxTrend = Math.max(
    1,
    ...data.trend.map((item) => Number(item.requested ?? 0)),
  );

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center gap-4">
        <Image
          src={brand.logo}
          alt={`Logo de ${data.unit.name}`}
          width={88}
          height={88}
          priority
          className="size-20 rounded-full border border-[#d9dfe6] bg-white object-contain p-1 shadow-sm"
        />
        <div>
          <p
            className="text-xs font-bold uppercase tracking-[.18em]"
            style={{ color: brand.accent }}
          >
            {["HOC", "HOB", "HU"].includes(data.unit.code)
              ? "Dashboard Ejecutivo"
              : "Panel ejecutivo"}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {data.unit.name}
          </h1>
          <p className="mt-1 text-sm text-[#5c6f85]">{brand.description}</p>
        </div>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(([label, value, Icon]) => (
          <Panel key={label} className="flex items-center gap-3 p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-[#ebf1f7] text-[#083f7d]">
              <Icon size={19} />
            </span>
            <div>
              <p className="text-xs uppercase text-[#63778e]">{label}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </div>
          </Panel>
        ))}
      </div>

      {operationalCards.length > 0 && (
        <Panel className="mb-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Operación de la unidad</h2>
              <p className="text-xs text-[#63778e]">
                Indicadores actualizados para {data.today}.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {operationalCards.map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border bg-[#f7f9fb] px-4 py-3"
              >
                <p className="text-xs uppercase text-[#63778e]">{label}</p>
                <p className="mt-1 text-xl font-bold">{value}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <h2 className="font-semibold">Evolución de solicitudes</h2>
          <p className="mb-5 text-xs text-[#63778e]">
            Últimos seis meses de la unidad seleccionada.
          </p>
          <div className="flex h-48 items-end gap-3 border-b border-[#d9dfe6] px-2">
            {data.trend.map((item) => {
              const requested = Number(item.requested ?? 0);
              return (
                <div
                  key={String(item.month_start)}
                  className="flex h-full flex-1 flex-col justify-end gap-2 text-center"
                >
                  <span className="text-[10px] font-semibold text-[#48586b]">
                    {clp.format(requested)}
                  </span>
                  <div
                    className="mx-auto w-full max-w-14 rounded-t-lg bg-[#0b4f9c]"
                    style={{
                      height: `${Math.max(4, (requested / maxTrend) * 130)}px`,
                    }}
                  />
                  <span className="pb-2 text-[10px] uppercase text-[#63778e]">
                    {monthLabel(String(item.month_start))}
                  </span>
                </div>
              );
            })}
            {data.trend.length === 0 && (
              <p className="m-auto text-sm text-[#63778e]">
                Aún no existen movimientos financieros para esta unidad.
              </p>
            )}
          </div>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Estado financiero del mes</h2>
          <p className="mb-4 text-xs text-[#63778e]">
            Solicitudes agrupadas por estado.
          </p>
          <div className="space-y-3">
            {data.statuses.map((item) => (
              <div
                key={String(item.status)}
                className="flex items-center justify-between rounded-xl border px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-semibold capitalize">
                    {uiLabel(item.status)}
                  </p>
                  <p className="text-xs text-[#63778e]">
                    {Number(item.request_count)} solicitud(es)
                  </p>
                </div>
                <b className="text-sm">
                  {clp.format(Number(item.total_amount ?? 0))}
                </b>
              </div>
            ))}
            {data.statuses.length === 0 && (
              <p className="rounded-xl bg-[#f7f9fb] p-4 text-sm text-[#63778e]">
                Sin solicitudes durante el período.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
