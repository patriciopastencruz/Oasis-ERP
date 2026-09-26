import {
  closingPaymentLabels,
  clp,
  executiveContext,
  longDayLabel,
  type ClosingHistoryRow,
  type ClosingPaymentMethod,
  type DailyClosing,
} from "@/modules/lodging/domain/daily-closing";

// Mismos colores que la hoja ejecutiva del PDF: el color sigue al medio de pago.
const methodColor: Record<string, string> = {
  transfer: "#2a78d6",
  cash: "#eb6834",
  card: "#1baf7a",
  airbnb: "#eda100",
  others: "#8a96a3",
};
const status = {
  good: { color: "#0ca30c", icon: "✓", label: "Bien" },
  warning: { color: "#fab219", icon: "!", label: "Atención" },
  serious: { color: "#ec835a", icon: "!", label: "Importante" },
} as const;

const pct = (v: number, digits = 0) =>
  `${v.toLocaleString("es-CL", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
const short = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `$${(v / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M`
    : `$${Math.round(v / 1000).toLocaleString("es-CL")} mil`;

function Card({ title, note, children, className = "" }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-[#e3e8ee] bg-white p-4 ${className}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-[#52606f]">{title}</h3>
        {note && <span className="text-[11px] text-[#8a96a3]">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Ring({ value }: { value: number }) {
  const r = 26,
    c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0" role="img" aria-label={`Ocupación ${pct(value * 100)}`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#e8edf3" strokeWidth="8" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="#2a78d6"
        strokeWidth="8"
        strokeDasharray={`${c * Math.min(value, 1)} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="36" textAnchor="middle" className="fill-[#16202c] text-[12px] font-bold">
        {pct(value * 100)}
      </text>
    </svg>
  );
}

/** Vista previa en pantalla de la hoja ejecutiva (página 1 del PDF). */
export function ClosingExecutive({
  unitName,
  unitLogo,
  closing,
  history,
}: {
  unitName: string;
  unitLogo: string;
  closing: DailyClosing;
  history: ClosingHistoryRow[];
}) {
  const m = closing.metrics;
  const ctx = executiveContext(closing, history);
  const occupancy = closing.total_rooms ? closing.occupied_rooms / closing.total_rooms : 0;
  const issued = closing.status === "issued";

  const byMethod = m.payments_by_method;
  const fixed: ClosingPaymentMethod[] = ["transfer", "cash", "card", "airbnb"];
  const others = (["booking", "company", "other"] as ClosingPaymentMethod[]).reduce((s, k) => s + Number(byMethod[k] ?? 0), 0);
  const methods = [
    ...fixed.map((k) => ({ key: k as string, label: closingPaymentLabels[k], amount: Number(byMethod[k] ?? 0) })),
    { key: "others", label: "Otros", amount: others },
  ].filter((x) => x.amount > 0);
  const methodTotal = methods.reduce((s, x) => s + x.amount, 0);

  const incomes = ctx.week.map((d) => d.income ?? 0);
  const max = Math.max(...incomes, 1);
  const peak = Math.max(...incomes);
  const priorDays = ctx.week.slice(0, 6).filter((d) => d.income !== null).length;
  const mo = ctx.month;

  const alerts: { level: keyof typeof status; title: string; detail: string }[] = [];
  if (closing.pending_amount > 0)
    alerts.push({
      level: "warning",
      title: `Saldo pendiente de cobro ${clp(closing.pending_amount)}`,
      detail: m.pending.slice(0, 3).map((p) => `${p.room} ${clp(p.balance)}`).join(" · "),
    });
  else alerts.push({ level: "good", title: "Sin saldos pendientes de cobro", detail: "Todas las estadías en curso están pagadas" });
  if (closing.reported_problems) alerts.push({ level: "serious", title: "Problema reportado", detail: closing.reported_problems });
  else alerts.push({ level: "good", title: "Sin problemas reportados", detail: "Recepción no informó incidencias" });
  if (closing.items_to_replenish) alerts.push({ level: "warning", title: "Reponer", detail: closing.items_to_replenish });
  if (m.reservations_without_price > 0)
    alerts.push({
      level: "warning",
      title: `${m.reservations_without_price} reserva(s) activa(s) sin precio`,
      detail: "Cárgales el monto para que la venta promedio sea correcta",
    });
  else alerts.push({ level: "good", title: "Todas las reservas activas tienen precio", detail: "0 reservas en $0" });

  return (
    <article className="overflow-hidden rounded-2xl border bg-[#f3f6fa] text-[#16202c] shadow-sm">
      <header className="flex flex-wrap items-center gap-4 bg-[#0b2f5f] px-5 py-4 text-white">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={unitLogo} alt="" className="size-11 rounded-full object-contain" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#9fb8d9]">Cierre diario</p>
          <h2 className="truncate text-xl font-bold">{unitName}</h2>
          <p className="text-xs text-[#c8d6ea]">
            {m.guests} huéspedes · {m.arrivals} llegadas · {m.departures} salidas
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">{longDayLabel(closing.closing_date)}</p>
          <span className={`mt-1 inline-block rounded-full px-3 py-0.5 text-[11px] font-bold ${issued ? "bg-[#1f7a3d]" : "bg-[#9a6400]"}`}>
            {issued ? "EMITIDO" : "BORRADOR"}
          </span>
        </div>
      </header>

      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card title="Ingreso del día">
            <p className="text-2xl font-bold tabular-nums">{clp(closing.total_received)}</p>
            {ctx.change !== null ? (
              <p className="mt-1 text-xs font-semibold text-[#52606f]">
                <span className={ctx.change >= 0 ? "text-[#0ca30c]" : "text-[#d03b3b]"}>{ctx.change >= 0 ? "▲" : "▼"}</span>{" "}
                {ctx.change >= 0 ? "+" : ""}
                {pct(ctx.change)} vs prom. {priorDays} día{priorDays === 1 ? "" : "s"}
              </p>
            ) : (
              <p className="mt-1 text-xs text-[#52606f]">Sin días previos para comparar</p>
            )}
            <p className="mt-1 text-[11px] text-[#8a96a3]">Lo que efectivamente entró hoy</p>
          </Card>
          <Card title="Ocupación">
            <div className="flex items-center gap-3">
              <Ring value={occupancy} />
              <div>
                <p className="text-xl font-bold tabular-nums">
                  {closing.occupied_rooms}/{closing.total_rooms}
                </p>
                <p className="text-xs text-[#52606f]">habitaciones</p>
                <p className="text-xs text-[#52606f]">{m.available_rooms} disponibles</p>
              </div>
            </div>
          </Card>
          <Card title="Venta promedio">
            <p className="text-2xl font-bold tabular-nums">{clp(closing.average_rate)}</p>
            <p className="mt-1 text-xs text-[#52606f]">por habitación ocupada</p>
            <p className="mt-1 text-xs font-semibold text-[#52606f]">RevPAR {clp(closing.average_rate * occupancy)}</p>
          </Card>
          <Card title="Resultado del día">
            <p className="text-2xl font-bold tabular-nums">{clp(closing.net_result)}</p>
            <p className="mt-1 text-xs text-[#52606f]">Ingreso {clp(closing.total_received)}</p>
            <p className="text-xs text-[#52606f]">Gasto {clp(closing.expense_total)}</p>
            <p className={`text-xs font-bold ${closing.pending_amount > 0 ? "text-[#9a6400]" : "text-[#52606f]"}`}>
              Pendiente {clp(closing.pending_amount)}
            </p>
          </Card>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Card title="Ocupación y venta por tipo">
            <ul className="space-y-3">
              {m.by_type.map((t) => (
                <li key={t.room_type} title={`${t.room_type}: ${t.occupied} de ${t.total} ocupadas, venta promedio ${clp(t.average_rate)}`}>
                  <div className="flex justify-between gap-2 text-xs">
                    <b className="truncate">{t.room_type}</b>
                    <span className="shrink-0 text-[#52606f]">
                      {t.occupied}/{t.total} · {clp(t.average_rate)} prom.
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-[#e8edf3]">
                    <div
                      className="h-2 rounded-r-full bg-[#2a78d6]"
                      style={{ width: `${t.total ? (t.occupied / t.total) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Ingresos por medio de pago" note={clp(closing.total_received)}>
            {methodTotal > 0 ? (
              <>
                <div className="flex h-3.5 gap-0.5 overflow-hidden rounded">
                  {methods.map((x) => (
                    <div
                      key={x.key}
                      title={`${x.label}: ${clp(x.amount)} (${pct((x.amount / methodTotal) * 100)})`}
                      style={{ width: `${(x.amount / methodTotal) * 100}%`, background: methodColor[x.key] }}
                    />
                  ))}
                </div>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {methods.map((x) => (
                    <li key={x.key} className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ background: methodColor[x.key] }} />
                      <span className="flex-1">{x.label}</span>
                      <b className="tabular-nums">{clp(x.amount)}</b>
                      <span className="w-10 text-right text-[#52606f]">{pct((x.amount / methodTotal) * 100)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-xs text-[#52606f]">Sin ingresos registrados en el día.</p>
            )}
          </Card>
        </div>

        <Card title="Ingreso últimos 7 días" note="Ocupación bajo cada día">
          <div className="relative flex h-32 items-end gap-2 border-b border-[#8a96a3] pt-5">
            <div className="pointer-events-none absolute inset-x-0 top-5 border-t border-dashed border-[#e3e8ee]" />
            <div className="pointer-events-none absolute inset-x-0 top-[62%] border-t border-dashed border-[#e3e8ee]" />
            {ctx.week.map((d, i) => {
              const today = i === 6;
              const h = d.income === null ? 0 : (d.income / max) * 100;
              return (
                <div key={d.date} className="relative flex h-full flex-1 flex-col items-center justify-end">
                  {d.income === null ? (
                    <span className="mb-1 text-[10px] text-[#8a96a3]">sin cierre</span>
                  ) : (
                    <>
                      {(today || (d.income === peak && peak > 0)) && (
                        <span className="mb-0.5 text-[10px] font-bold tabular-nums">{short(d.income)}</span>
                      )}
                      <div
                        title={`${d.label}: ${clp(d.income)}${d.occupancy === null ? "" : ` · ocupación ${pct(d.occupancy)}`}`}
                        className={`w-full max-w-9 rounded-t ${today ? "bg-[#2a78d6]" : "bg-[#b9d4f4]"}`}
                        style={{ height: `${h}%`, minHeight: d.income > 0 ? 2 : 0 }}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-2 text-center text-[11px]">
            {ctx.week.map((d, i) => (
              <div key={d.date} className="flex-1">
                <p className={i === 6 ? "font-bold" : "text-[#52606f]"}>{d.label}</p>
                <p className="text-[#8a96a3]">{d.occupancy === null ? "-" : pct(d.occupancy)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title={`${mo.name} a la fecha`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                [
                  "Ingreso acumulado",
                  clp(mo.income),
                  mo.previousIncome
                    ? `${mo.income >= mo.previousIncome ? "+" : ""}${pct((mo.income / mo.previousIncome - 1) * 100)} vs ${mo.previousName} al mismo día`
                    : `Sin cierres de ${mo.previousName} para comparar`,
                ],
                ["Gasto acumulado", clp(mo.expense), mo.income ? `${pct((mo.expense / mo.income) * 100, 1)} del ingreso` : "-"],
                [
                  "Ocupación promedio",
                  pct(mo.occupancy, 1),
                  `${mo.availablePerDay.toLocaleString("es-CL", { maximumFractionDigits: 1 })} hab. libres por día`,
                ],
                [
                  "Días con cierre",
                  `${mo.closedDays}/${mo.elapsedDays}`,
                  mo.elapsedDays - mo.closedDays > 0 ? `${mo.elapsedDays - mo.closedDays} día(s) sin cierre emitido` : "Todos los días cerrados",
                ],
              ] as const
            ).map(([label, value, hint]) => (
              <div key={label}>
                <p className="text-xs text-[#52606f]">{label}</p>
                <p className="text-lg font-bold tabular-nums">{value}</p>
                <p className="text-[11px] text-[#8a96a3]">{hint}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-2">
          <Card title="Control del día">
            <ul className="space-y-2.5">
              {alerts.map((a, i) => (
                <li key={i} className="flex gap-2.5">
                  <span
                    aria-label={status[a.level].label}
                    className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: status[a.level].color }}
                  >
                    {status[a.level].icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{a.title}</p>
                    <p className="whitespace-pre-line text-xs text-[#52606f]">{a.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Observaciones generales">
            <p className={`whitespace-pre-line text-sm ${closing.observations ? "" : "text-[#8a96a3]"}`}>
              {closing.observations || "Sin observaciones."}
            </p>
          </Card>
        </div>
      </div>
    </article>
  );
}
