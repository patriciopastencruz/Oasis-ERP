import { clp, pct } from "@/modules/lodging/domain/daily-closing";
import type { PeriodReport } from "@/modules/lodging/domain/period-report";

// Mismos colores que los PDF: el color sigue al medio de pago.
const methodColor: Record<string, string> = { transfer: "#2a78d6", cash: "#eb6834", card: "#1baf7a", airbnb: "#eda100", others: "#8a96a3" };
const methodLabel: Record<string, string> = { transfer: "Transferencia", cash: "Efectivo", card: "Tarjeta", airbnb: "Airbnb", others: "Otros" };
const ramp = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
const level = (occ: number) => Math.max(0, Math.min(ramp.length - 1, Math.floor(((occ - 0.5) / 0.5) * ramp.length)));
const short = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M` : `$${Math.round(v / 1000).toLocaleString("es-CL")} mil`;

function Card({ title, note, children, className = "" }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-[#e3e8ee] bg-white p-4 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-[#52606f]">{title}</h3>
        {note && <span className="text-[11px] text-[#8a96a3]">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Delta({ value, suffix, unit = "%" }: { value: number | null; suffix: string; unit?: string }) {
  if (value === null || !Number.isFinite(value)) return null;
  if (Math.abs(value) < 0.5) return <p className="mt-1 text-xs font-semibold text-slate-500">— sin cambio {suffix}</p>;
  return (
    <p className="mt-1 text-xs font-semibold text-slate-600">
      <span className={value >= 0 ? "text-[#0ca30c]" : "text-[#d03b3b]"}>{value >= 0 ? "▲" : "▼"}</span> {value >= 0 ? "+" : ""}
      {value.toLocaleString("es-CL", { maximumFractionDigits: 1 })}
      {unit} {suffix}
    </p>
  );
}

const status = { good: ["#0ca30c", "✓"], warning: ["#fab219", "!"], serious: ["#ec835a", "!"] } as const;
function Alert({ level: lvl, title, detail }: { level: keyof typeof status; title: string; detail: string }) {
  return (
    <li className="flex gap-2.5">
      <span className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: status[lvl][0] }}>
        {status[lvl][1]}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-[#52606f]">{detail}</p>
      </div>
    </li>
  );
}

/** Vista web del resumen semanal/quincenal (mismo contenido que el PDF). */
export function PeriodExecutive({ report }: { report: PeriodReport }) {
  const { ops } = report;
  const prev = report.kind === "week" ? "sem. anterior" : "quinc. anterior";
  const noun = report.kind === "week" ? "semana" : "quincena";
  const max = Math.max(1, ...report.days.map((d) => d.received));
  const avg = report.income / Math.max(1, report.days.length);
  const others = ["booking", "company", "other"].reduce((s, k) => s + Number(ops.byMethod[k] ?? 0), 0);
  const methods = ["transfer", "cash", "card", "airbnb"].map((k) => ({ k, v: Number(ops.byMethod[k] ?? 0) })).concat([{ k: "others", v: others }]).filter((m) => m.v > 0);
  const mTotal = methods.reduce((s, m) => s + m.v, 0);
  const gmax = Math.max(1, report.expenseCategories[0]?.amount ?? 1);
  const maxRevenue = Math.max(1, ops.rooms[0]?.revenue ?? 1);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Ingreso cobrado", value: clp(report.income), delta: <Delta value={report.deltas.income} suffix={`vs ${prev}`} /> },
          { label: "Ocupación", value: pct(ops.occupancy * 100), delta: <Delta value={report.deltas.occupancyPts} suffix={`vs ${prev}`} unit=" pts" /> },
          { label: "Venta prom. (ADR)", value: clp(ops.adr), delta: <Delta value={report.deltas.adr} suffix={`vs ${prev}`} /> },
          { label: "RevPAR", value: clp(ops.revpar), delta: <Delta value={report.deltas.revpar} suffix={`vs ${prev}`} /> },
          {
            label: "Resultado",
            value: clp(report.result),
            delta: (
              <p className="mt-1 text-xs text-slate-500">
                {report.margin !== null && <b className="text-slate-600">Margen {pct(report.margin)} · </b>}gasto {clp(report.expenseTotal)}
              </p>
            ),
          },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-[#e3e8ee] bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#52606f]">{k.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{k.value}</p>
            {k.delta}
          </div>
        ))}
      </div>

      <Card title="Ingreso cobrado por día y ocupación" note={`Línea punteada: promedio diario ${short(avg)}`}>
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            <div className="relative flex h-40 items-end gap-1.5 border-b border-[#8a96a3] pt-5">
              {avg > 0 && (
                <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-500" style={{ bottom: `${(avg / max) * 100 * (135 / 160)}%` }} />
              )}
              {report.days.map((d) => {
                const best = d === report.best;
                return (
                  <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end" title={`${d.label}: ${clp(d.received)} · ocupación ${pct(d.occupancy * 100)}`}>
                    {(best || report.days.length <= 8) && d.received > 0 && (
                      <span className={`mb-0.5 text-[10px] tabular-nums ${best ? "font-bold" : "text-slate-500"}`}>{short(d.received)}</span>
                    )}
                    <div
                      className={`w-full max-w-9 rounded-t ${best ? "bg-[#2a78d6]" : "bg-[#b9d4f4]"}`}
                      style={{ height: `${(Math.max(0, d.received) / max) * 135}px` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex gap-1.5 text-center text-[11px]">
              {report.days.map((d) => {
                const lvl = level(d.occupancy);
                return (
                  <div key={d.date} className="flex-1">
                    <p className="font-semibold">{d.label}</p>
                    <p
                      className="mx-auto mt-1 max-w-12 rounded px-1 py-0.5 font-bold"
                      style={{ background: ramp[lvl], color: lvl >= 3 ? "#fff" : "#16202c" }}
                    >
                      {pct(d.occupancy * 100)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-[#8a96a3]">Ocupación de la noche: color más intenso = mayor ocupación (50% a 100%).</p>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Ocupación y venta por tipo">
          <ul className="space-y-3">
            {ops.types.map((t) => (
              <li key={t.type}>
                <div className="flex justify-between gap-2 text-xs">
                  <b>{t.type}</b>
                  <span className="text-[#52606f]">
                    {pct(t.occ * 100)} ocup. · {clp(t.adr)} ADR
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-[#e8edf3]">
                  <div className="h-2 rounded-r-full bg-[#2a78d6]" style={{ width: `${t.occ * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Ingresos por medio de pago" note={clp(report.income)}>
          {mTotal ? (
            <>
              <div className="flex h-3.5 gap-0.5 overflow-hidden rounded">
                {methods.map((m) => (
                  <div key={m.k} title={`${methodLabel[m.k]}: ${clp(m.v)}`} style={{ width: `${(m.v / mTotal) * 100}%`, background: methodColor[m.k] }} />
                ))}
              </div>
              <ul className="mt-3 space-y-1.5 text-xs">
                {methods.map((m) => (
                  <li key={m.k} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-sm" style={{ background: methodColor[m.k] }} />
                    <span className="flex-1">{methodLabel[m.k]}</span>
                    <b className="tabular-nums">{clp(m.v)}</b>
                    <span className="w-10 text-right text-[#52606f]">{pct((m.v / mTotal) * 100)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-[#52606f]">Sin pagos recibidos en el período.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title={`Destacados de la ${noun}`}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Mejor día", report.best ? `${report.best.label}: ${clp(report.best.received)}` : "Sin cobros"],
              ["Día más bajo", report.worst ? `${report.worst.label}: ${clp(report.worst.received)}` : "Sin cobros"],
              ["Ocupación vie-sáb vs resto", report.weekendOcc === null || report.weekdayOcc === null ? "—" : `${pct(report.weekendOcc * 100)} vs ${pct(report.weekdayOcc * 100)}`],
              ["Habitaciones libres por noche", (ops.totalRooms * (1 - ops.occupancy)).toLocaleString("es-CL", { maximumFractionDigits: 1 })],
              ["Tipo con más demanda", report.topType ? `${report.topType.type} · ${pct(report.topType.occ * 100)}` : "—"],
              ["Noches vendidas", `${ops.nightsSold} · ${report.arrivals} llegadas`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-[#52606f]">{k}</dt>
                <dd className="font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title={`Control de la ${noun}`}>
          <ul className="space-y-2.5">
            <Alert
              level={report.pendingAtEnd > 0 ? "warning" : "good"}
              title={report.pendingAtEnd > 0 ? `Por cobrar al cierre: ${clp(report.pendingAtEnd)}` : "Sin saldos por cobrar"}
              detail={report.pendingRooms.slice(0, 3).map((r) => `${r.room} ${clp(r.balance)}`).join(" · ") || "Según el último cierre emitido"}
            />
            <Alert
              level={report.problems.length ? "serious" : "good"}
              title={report.problems.length ? `${report.problems.length} problema(s) reportado(s)` : "Sin problemas reportados"}
              detail={report.problems.map((p) => p.text).join(" · ") || "Recepción no informó incidencias"}
            />
            <Alert level={report.replenish ? "warning" : "good"} title={report.replenish ? "Reposición pendiente" : "Sin reposiciones pendientes"} detail={report.replenish ?? "—"} />
            <Alert
              level={report.missingDates.length ? "warning" : "good"}
              title={report.missingDates.length ? `${report.missingDates.length} día(s) sin cierre emitido` : "Todos los días con cierre emitido"}
              detail={report.missingDates.length ? report.missingDates.map((d) => d.split("-").reverse().join("-")).join(", ") : "Los gastos se suman desde los cierres emitidos"}
            />
          </ul>
        </Card>
      </div>

      <Card title="Gastos por categoría" note={`${clp(report.expenseTotal)}${report.income ? ` · ${pct((report.expenseTotal / report.income) * 100)} del ingreso` : ""}`}>
        {report.expenseCategories.length ? (
          <ul className="space-y-2 text-sm">
            {report.expenseCategories.map((e) => (
              <li key={e.name} className="grid grid-cols-[160px_1fr_90px] items-center gap-3">
                <span className="truncate">{e.name}</span>
                <span className="h-2 rounded-full bg-[#e8edf3]">
                  <span className="block h-2 rounded-r-full bg-[#eb6834]" style={{ width: `${(e.amount / gmax) * 100}%` }} />
                </span>
                <b className="text-right tabular-nums">{clp(e.amount)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[#52606f]">Sin gastos registrados en cierres emitidos.</p>
        )}
      </Card>

      <Card title="Ocupación e ingreso por habitación" note={`Promedio del hostal ${pct(ops.occupancy * 100)} · ordenado por venta`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="text-left text-xs text-[#52606f]">
              <tr>
                <th className="pb-2">Habitación</th>
                <th className="pb-2">Tipo</th>
                <th className="pb-2">Ocupación</th>
                <th className="pb-2 text-right">Noches</th>
                <th className="pb-2 text-right">Venta</th>
                <th className="pb-2 text-right">Tarifa prom.</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {ops.rooms.map((r) => {
                const low = r.occ < ops.occupancy - 0.15;
                return (
                  <tr key={r.name} className="border-t">
                    <td className="py-1.5 font-semibold">{r.name}</td>
                    <td className="text-xs text-[#52606f]">{r.type}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="relative h-2 w-28 rounded-full bg-[#e8edf3]">
                          <div className="h-2 rounded-r-full" style={{ width: `${r.occ * 100}%`, background: low ? "#ec835a" : "#2a78d6" }} />
                          <div className="absolute -top-1 h-4 border-l border-dashed border-slate-500" style={{ left: `${ops.occupancy * 100}%` }} />
                        </div>
                        <span className={low ? "font-bold" : ""}>{pct(r.occ * 100)}</span>
                      </div>
                    </td>
                    <td className="text-right">{r.nights}</td>
                    <td className="text-right">
                      <span className="mr-2 inline-block h-1.5 w-10 rounded-full bg-[#e8edf3] align-middle">
                        <span className="block h-1.5 rounded-full bg-[#b9d4f4]" style={{ width: `${(r.revenue / maxRevenue) * 100}%` }} />
                      </span>
                      <b>{clp(r.revenue)}</b>
                    </td>
                    <td className="text-right text-[#52606f]">{r.nights ? clp(r.adr) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex flex-wrap gap-4 text-[11px] text-[#8a96a3]">
          <span>
            <span className="mr-1 inline-block size-2 rounded-sm bg-[#ec835a]" />
            Más de 15 puntos bajo el promedio
          </span>
          <span>┆ Promedio de ocupación del hostal</span>
        </p>
      </Card>

      <Card title="Lectura del período">
        <ul className="space-y-2 text-sm">
          {report.conclusions.map((c) => (
            <li key={c} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#2a78d6]" />
              {c}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
