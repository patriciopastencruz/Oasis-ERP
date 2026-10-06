import Link from "next/link";
import { AlertTriangle, BedDouble, CalendarClock, Wallet } from "lucide-react";
import { LodgingReportTabs } from "@/components/lodging/report-tabs";
import { PageHeader, Panel } from "@/components/ui/page";
import {
  clp,
  formatDate,
  lodgingContext,
} from "@/modules/lodging/application/queries";
import {
  balanceStage,
  netConfirmedPayments,
  outstandingBalance,
  overdueDays,
  type BalanceStage,
} from "@/modules/lodging/domain/outstanding-balances";

const scopes: { key: "all" | BalanceStage; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "overdue", label: "Vencidos" },
  { key: "current", label: "Alojados" },
  { key: "upcoming", label: "Próximos" },
];

const stageLabels: Record<BalanceStage, string> = {
  overdue: "Vencido",
  current: "Huésped alojado",
  upcoming: "Próximo",
};

const stageStyles: Record<BalanceStage, string> = {
  overdue: "bg-red-50 text-red-700",
  current: "bg-amber-50 text-amber-800",
  upcoming: "bg-blue-50 text-blue-700",
};

function todayInSantiago() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}

export default async function OutstandingBalancesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await lodgingContext(
    "lodging.reservations.view",
  );
  const today = todayInSantiago();
  const scope = scopes.some((item) => item.key === q.scope)
    ? (q.scope as "all" | BalanceStage)
    : "all";

  const { data } = await supabase
    .from("lodging_reservations")
    .select(
      "id,status,origin,check_in,check_out,nights,total_value,postpaid_company,lodging_rooms(name),lodging_guests(full_name,phone,email),lodging_reservation_payments(amount,type,status)",
    )
    .eq("business_unit_id", unit.id)
    .not("status", "in", '("cancelled","conflict")')
    .gt("total_value", 0)
    .order("check_out", { ascending: true });

  const balances = (data ?? [])
    .map((reservation) => {
      const payments = reservation.lodging_reservation_payments ?? [];
      const paid = netConfirmedPayments(payments);
      const balance = outstandingBalance(reservation.total_value, payments);
      const stage = balanceStage(
        reservation.check_in,
        reservation.check_out,
        today,
      );
      const guest = Array.isArray(reservation.lodging_guests)
        ? reservation.lodging_guests[0]
        : reservation.lodging_guests;
      const room = Array.isArray(reservation.lodging_rooms)
        ? reservation.lodging_rooms[0]
        : reservation.lodging_rooms;
      return { ...reservation, paid, balance, stage, guest, room };
    })
    .filter((reservation) => reservation.balance > 0.5);

  const visible = balances.filter(
    (reservation) => scope === "all" || reservation.stage === scope,
  );
  const pendingTotal = balances.reduce(
    (total, reservation) => total + reservation.balance,
    0,
  );
  const overdue = balances.filter(
    (reservation) => reservation.stage === "overdue",
  );
  const overdueTotal = overdue.reduce(
    (total, reservation) => total + reservation.balance,
    0,
  );
  const cards = [
    ["Saldo total pendiente", clp.format(pendingTotal), Wallet],
    ["Reservas con saldo", String(balances.length), BedDouble],
    ["Saldo vencido", clp.format(overdueTotal), AlertTriangle],
    ["Casos vencidos", String(overdue.length), CalendarClock],
  ] as const;

  return (
    <>
      <LodgingReportTabs active="balances" permissions={ctx.permissions} />
      <PageHeader
        eyebrow={unit.name}
        title="Saldos pendientes"
        description="Detalle de reservas con montos por cobrar para revisar y gestionar cada caso."
      />

      <div className="mb-5 mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <div
            key={label}
            className="rounded-2xl border border-[#d9dfe6] bg-white p-4 shadow-[0_10px_30px_rgba(20,57,39,.04)]"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-[#0b4f9c]">
              <Icon size={17} />
            </span>
            <b className="mt-3 block text-2xl leading-none text-slate-800">
              {value}
            </b>
            <span className="mt-1.5 block text-xs text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {scopes.map((item) => (
          <Link
            key={item.key}
            href={`/lodging/reports/balances?scope=${item.key}`}
            className={`rounded-full border px-3 py-1.5 font-medium ${
              scope === item.key
                ? "border-[#0b4f9c] bg-[#0b4f9c] text-white"
                : "bg-white hover:border-[#0b4f9c]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Detalle para revisión</h2>
            <p className="mt-1 text-xs text-slate-500">
              Los montos consideran pagos confirmados y devoluciones. Se
              excluyen reservas anuladas o en conflicto.
            </p>
          </div>
          <span className="text-sm font-semibold text-slate-700">
            {visible.length} {visible.length === 1 ? "caso" : "casos"}
          </span>
        </div>

        {visible.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-y bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Habitación</th>
                  <th className="px-3 py-2">Entrada</th>
                  <th className="px-3 py-2">Salida</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Pagado</th>
                  <th className="px-3 py-2 text-right">Pendiente</th>
                  <th className="px-3 py-2 text-right">Revisión</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((reservation) => {
                  const days = overdueDays(reservation.check_out, today);
                  return (
                    <tr key={reservation.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-3 align-top">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${stageStyles[reservation.stage]}`}
                        >
                          {stageLabels[reservation.stage]}
                        </span>
                        {reservation.stage === "overdue" && (
                          <span className="mt-1 block text-xs text-red-600">
                            {days} {days === 1 ? "día" : "días"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <b className="block text-slate-800">
                          {reservation.guest?.full_name ?? "Sin identificar"}
                          {reservation.postpaid_company ? " · Empresa" : ""}
                        </b>
                        <span className="block text-xs text-slate-500">
                          {reservation.guest?.phone || "Sin teléfono"}
                        </span>
                        {reservation.guest?.email && (
                          <span className="block text-xs text-slate-400">
                            {reservation.guest.email}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top font-medium">
                        {reservation.room?.name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-top">
                        {formatDate(reservation.check_in)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-top">
                        {formatDate(reservation.check_out)}
                      </td>
                      <td className="px-3 py-3 text-right align-top tabular-nums">
                        {clp.format(Number(reservation.total_value))}
                      </td>
                      <td className="px-3 py-3 text-right align-top tabular-nums text-emerald-700">
                        {clp.format(reservation.paid)}
                      </td>
                      <td className="px-3 py-3 text-right align-top font-bold tabular-nums text-red-700">
                        {clp.format(reservation.balance)}
                      </td>
                      <td className="px-3 py-3 text-right align-top">
                        <Link
                          href={`/lodging/reservations/${reservation.id}`}
                          className="inline-flex rounded-lg border border-[#0b4f9c] px-3 py-1.5 text-xs font-semibold text-[#0b4f9c] hover:bg-[#edf4fc]"
                        >
                          Ver reserva
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-emerald-50 p-5 text-sm text-emerald-800">
            No hay saldos pendientes en esta categoría.
          </div>
        )}
      </Panel>
    </>
  );
}
