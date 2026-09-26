import {
  closingPaymentLabels,
  clp,
  expenseMethodLabels,
  formatClosingDate,
  paymentTypeLabels,
  pct,
  type ClosingExpense,
  type DailyClosing,
} from "@/modules/lodging/domain/daily-closing";

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <tr className="border border-dotted border-slate-500">
      <td className="w-1/2 border-r border-dotted border-slate-500 px-3 py-1.5">{label}</td>
      <td className={`whitespace-pre-line px-3 py-1.5 text-center ${strong ? "font-bold" : "font-medium"}`}>
        {value}
      </td>
    </tr>
  );
}

/** Vista previa del cierre con el mismo orden y formato que el PDF. */
export function ClosingReport({
  unitName,
  unitLogo,
  closing,
  expenses,
}: {
  unitName: string;
  unitLogo: string;
  closing: DailyClosing;
  expenses: ClosingExpense[];
}) {
  const m = closing.metrics;
  const methods = m.payments_by_method;
  return (
    <article className="mx-auto max-w-2xl rounded-2xl border bg-white p-5 text-sm shadow-sm sm:p-8">
      <header className="mb-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={unitLogo} alt="" className="mx-auto size-20 object-contain" />
        <p className="mt-1 font-bold uppercase tracking-wide text-[#173f87]">{unitName}</p>
      </header>
      <div className="bg-[#173f87] py-1.5 text-center text-base font-bold text-white">Cierre Diario</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse">
          <tbody>
            <Row label="Fecha" value={formatClosingDate(closing.closing_date)} />
            <Row label="Total Habitaciones" value={closing.total_rooms} />
            <Row label="Habitaciones Ocupadas" value={closing.occupied_rooms} />
            <Row label="Habitaciones Disponibles" value={m.available_rooms} />
            <Row label="% Ocupación" value={pct(closing.occupancy_pct)} />
            {m.by_type.map((t) => (
              <Row
                key={t.room_type}
                label={`Venta Promedio ${t.room_type}`}
                value={`${clp(t.average_rate)}  (${t.occupied}/${t.total})`}
              />
            ))}
            <Row label="Venta Promedio General" value={clp(closing.average_rate)} />
            <Row label="Huéspedes Alojados" value={m.guests} />
            <Row label="Llegadas / Salidas" value={`${m.arrivals} / ${m.departures}`} />
            <Row label="Monto Efectivo" value={clp(methods.cash)} />
            <Row label="Monto Transferencia" value={clp(methods.transfer)} />
            <Row label="Monto Tarjeta" value={clp(methods.card)} />
            <Row label="Monto Airbnb" value={clp(methods.airbnb)} />
            {methods.booking ? <Row label="Monto Booking" value={clp(methods.booking)} /> : null}
            {methods.company ? <Row label="Monto Empresa" value={clp(methods.company)} /> : null}
            {methods.other ? <Row label="Monto Otros" value={clp(methods.other)} /> : null}
            <Row label="Monto Total" value={clp(closing.total_received)} strong />
            <Row label="Monto Pendiente" value={clp(closing.pending_amount)} />
            <Row label="Gasto Total" value={clp(closing.expense_total)} />
            <Row label="Resultado del Día (Ingreso − Gasto)" value={clp(closing.net_result)} strong />
            {m.reservations_without_price ? (
              <Row label="Reservas sin precio" value={m.reservations_without_price} />
            ) : null}
            <Row label="Problemas Reportados" value={closing.reported_problems ?? ""} />
            <Row label="Elementos que deben Reponerse" value={closing.items_to_replenish ?? ""} />
            <Row label="Observaciones Generales" value={closing.observations ?? ""} />
          </tbody>
        </table>
      </div>

      {m.payments.length > 0 && (
        <Detail title="Detalle de ingresos del día" headers={["Habitación", "Huésped", "Tipo", "Medio", "Monto"]}>
          {m.payments.map((p, i) => (
            <tr key={i} className="border-t">
              <td className="py-1.5">{p.room}</td>
              <td>{p.guest ?? "—"}</td>
              <td>{paymentTypeLabels[p.type] ?? p.type}</td>
              <td>{closingPaymentLabels[p.method] ?? p.method}</td>
              <td className="text-right tabular-nums">{clp(p.amount)}</td>
            </tr>
          ))}
        </Detail>
      )}
      {m.pending.length > 0 && (
        <Detail title="Saldos pendientes de huéspedes" headers={["Habitación", "Huésped", "Total", "Pagado", "Pendiente"]}>
          {m.pending.map((p, i) => (
            <tr key={i} className="border-t">
              <td className="py-1.5">{p.room}</td>
              <td>
                {p.guest ?? "—"}
                {p.postpaid_company ? " (empresa)" : ""}
              </td>
              <td className="text-right tabular-nums">{clp(p.total)}</td>
              <td className="text-right tabular-nums">{clp(p.paid)}</td>
              <td className="text-right font-semibold tabular-nums">{clp(p.balance)}</td>
            </tr>
          ))}
        </Detail>
      )}
      {expenses.length > 0 && (
        <Detail title="Detalle de gastos" headers={["Descripción", "Medio", "Monto"]}>
          {expenses.map((e, i) => (
            <tr key={i} className="border-t">
              <td className="py-1.5">
                {e.description}
                {e.category_name && <span className="block text-[10px] text-slate-500">{e.category_name}</span>}
              </td>
              <td>{expenseMethodLabels[e.payment_method] ?? e.payment_method}</td>
              <td className="text-right tabular-nums">{clp(e.amount)}</td>
            </tr>
          ))}
        </Detail>
      )}
    </article>
  );
}

function Detail({ title, headers, children }: { title: string; headers: string[]; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#173f87]">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead className="bg-slate-50 text-left text-[#173f87]">
            <tr>
              {headers.map((h, i) => (
                <th key={h} className={`py-1.5 ${i === headers.length - 1 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}
