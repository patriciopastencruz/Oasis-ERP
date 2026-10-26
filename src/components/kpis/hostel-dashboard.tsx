import { Panel } from "@/components/ui/page";
import { clp } from "@/modules/lodging/domain/daily-closing";
import { goalMet, revparGoal } from "@/modules/lodging/domain/report-goals";
import { REVIEW_CATEGORIES, summarizeReviewHistory } from "@/modules/lodging/domain/review-scores";
import type { IndicatorChange } from "@/modules/lodging/domain/day-over-day";
import type { GroupWeeklyReport, HostelWeekly } from "@/modules/lodging/application/group-weekly-queries";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const score = (v: number) => v.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dm = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
const dmy = (iso: string) => iso.split("-").reverse().join("-");
const minutes = (m: number | null) =>
  m === null ? "—" : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
const monthName = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", month: "long" }).format(new Date(`${iso}T12:00:00Z`));

function GoalChip({ met, text }: { met: boolean | null; text: string }) {
  if (met === null) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${met ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
      {met ? "✓" : "✗"} meta {text}
    </span>
  );
}

function Delta({ value, unit = "", digits = 1 }: { value: number | null; unit?: string; digits?: number }) {
  if (value === null) return null;
  if (value === 0) return <span className="text-xs font-semibold text-slate-500">sin cambio</span>;
  return (
    <span className={`text-xs font-semibold ${value > 0 ? "text-emerald-600" : "text-red-600"}`}>
      {value > 0 ? "▲" : "▼"} {Math.abs(value).toLocaleString("es-CL", { maximumFractionDigits: digits })}
      {unit}
    </span>
  );
}

/** Hoy contra ayer y acumulado del mes contra el de ayer, para la venta promedio y el RevPAR. */
function VsYesterday({ day, cumulative, available, live }: { day: IndicatorChange; cumulative: IndicatorChange; available: boolean; live: boolean }) {
  if (!available)
    return <p className="mt-1 text-[11px] text-slate-400">Sin día anterior para comparar</p>;
  const chip = (c: IndicatorChange) =>
    c.pct === null ? (
      <span className="text-slate-400">sin comparación</span>
    ) : (
      <span className={`font-semibold ${c.pct > 0 ? "text-emerald-600" : c.pct < 0 ? "text-red-600" : "text-slate-500"}`}>
        {c.pct > 0 ? "▲ +" : c.pct < 0 ? "▼ " : ""}
        {c.pct.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%
      </span>
    );
  return (
    <dl className="mt-1.5 space-y-0.5 text-[11px] text-slate-600">
      <div className="flex items-center justify-between gap-2">
        <dt>{live ? "Hoy" : "Ese día"} {day.now === null ? "—" : clp(day.now)} <span className="text-slate-400">· ayer {day.before === null ? "—" : clp(day.before)}</span></dt>
        <dd>{chip(day)}</dd>
      </div>
      <div className="flex items-center justify-between gap-2">
        <dt>Acumulado del mes <span className="text-slate-400">vs acumulado a ayer</span></dt>
        <dd>{chip(cumulative)}</dd>
      </div>
    </dl>
  );
}

function Section({ n, title, note, children }: { n: number; title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="flex items-baseline gap-2 text-lg font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-[#0b4f9c] text-xs text-white">{n}</span>
        {title}
        <span className="text-xs font-normal text-slate-500">{note}</span>
      </h2>
      <div className="mt-3 grid gap-4 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function HostelName({ h }: { h: HostelWeekly }) {
  return <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#0b4f9c]">{h.unit.name}</p>;
}

function Occupancy({ h }: { h: HostelWeekly }) {
  const m = h.month;
  const last = m.days.at(-1);
  const g = h.goals.occupancyPct;
  return (
    <Panel>
      <HostelName h={h} />
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-4xl leading-none">{pct(m.occupancy)}</b>
        <GoalChip met={goalMet(Math.round(m.occupancy * 100), g)} text={`${g}%`} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {m.nightsSold} de {m.roomNights} noches
        {last && last.capacity ? ` · ocupadas el ${Number(last.date.slice(8))}: ${last.occupied} de ${last.capacity}` : ""}
      </p>
      <div className="mt-3 flex h-24 items-end gap-0.5" role="img" aria-label="Ocupación diaria del mes">
        {m.days.map((d, i) => {
          const occ = d.capacity ? d.occupied / d.capacity : 0;
          return (
            <div
              key={d.date}
              className="flex h-full flex-1 flex-col justify-end"
              title={`${dm(d.date)}: ${pct(occ)} (${d.occupied} de ${d.capacity})`}
            >
              <div
                className={`rounded-t ${i === m.days.length - 1 ? "bg-[#2a78d6]" : occ > 1 ? "bg-amber-400" : "bg-[#b9d4f4]"}`}
                style={{ height: `${Math.min(100, occ * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{m.days[0] ? dm(m.days[0].date) : ""}</span>
        <span>{last ? dm(last.date) : ""}</span>
      </p>
    </Panel>
  );
}

function Revenue({ h, live }: { h: HostelWeekly; live: boolean }) {
  const m = h.month;
  const rg = revparGoal(h.goals);
  const bar = (value: number, goal: number | null) => (
    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
      <div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${goal ? Math.min(100, (value / goal) * 100) : 100}%` }} />
    </div>
  );
  return (
    <Panel>
      <HostelName h={h} />
      <div>
        <p className="text-xs text-slate-500">Venta promedio por habitación</p>
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-2xl">{clp(m.adr)}</b>
          <GoalChip met={goalMet(m.adr, h.goals.averageRate)} text={h.goals.averageRate === null ? "" : clp(h.goals.averageRate)} />
        </div>
        {bar(m.adr, h.goals.averageRate)}
        <VsYesterday day={h.dayCompare.day.adr} cumulative={h.dayCompare.cumulative.adr} available={h.dayCompare.available} live={live} />
      </div>
      <div className="mt-3">
        <p className="text-xs text-slate-500">RevPAR (venta por habitación disponible)</p>
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-2xl">{clp(m.revpar)}</b>
          <GoalChip met={goalMet(m.revpar, rg)} text={rg === null ? "" : clp(rg)} />
        </div>
        {bar(m.revpar, rg)}
        <VsYesterday day={h.dayCompare.day.revpar} cumulative={h.dayCompare.cumulative.revpar} available={h.dayCompare.available} live={live} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">Venta del mes</dt>
          <dd className="font-semibold">{clp(m.revenue)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Recibido en caja</dt>
          <dd className="font-semibold">{clp(m.received)}</dd>
        </div>
      </dl>
    </Panel>
  );
}

function Inspections({ h }: { h: HostelWeekly }) {
  const i = h.inspections;
  return (
    <Panel>
      <HostelName h={h} />
      {!i.enabled ? (
        <p className="text-sm text-slate-500">Este hostal no usa el circuito de aseo e inspección.</p>
      ) : !i.available ? (
        <p className="text-sm text-slate-500">Sin acceso a los indicadores de operación.</p>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <b className="text-3xl leading-none">{i.approvedFirstPct === null ? "—" : `${i.approvedFirstPct}%`}</b>
            <span className="pb-0.5 text-xs text-slate-500">aprobadas a la primera</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><dt className="text-slate-500">Limpiezas</dt><dd className="font-semibold">{i.cleanings}</dd></div>
            <div><dt className="text-slate-500">Inspeccionadas</dt><dd className="font-semibold">{i.inspectedCleanings}</dd></div>
            <div><dt className="text-slate-500">Aprobadas / rechazadas</dt><dd className="font-semibold">{i.approved} / {i.rejected}</dd></div>
            <div><dt className="text-slate-500">Espera para inspección</dt><dd className="font-semibold">{minutes(i.avgWaitMinutes)}</dd></div>
          </dl>
        </>
      )}
      {i.enabled && (
        <p className={`mt-3 text-xs font-semibold ${i.pendingNow > 0 ? "text-amber-700" : "text-slate-500"}`}>
          {i.pendingNow > 0 ? `${i.pendingNow} habitación(es) por inspeccionar ahora` : "Sin habitaciones por inspeccionar"}
        </p>
      )}
    </Panel>
  );
}

function Booking({ h, reference }: { h: HostelWeekly; reference: string }) {
  const s = summarizeReviewHistory(h.reviews);
  if (!s.latest)
    return (
      <Panel>
        <HostelName h={h} />
        <p className="text-sm text-slate-500">Sin registros de puntaje todavía.</p>
      </Panel>
    );
  const age = Math.round((Date.parse(`${reference}T12:00:00Z`) - Date.parse(`${s.latest.recorded_on}T12:00:00Z`)) / 86_400_000);
  const g = h.goals.bookingScore;
  return (
    <Panel>
      <HostelName h={h} />
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-4xl leading-none">{score(s.latest.score)}</b>
        <Delta value={s.scoreDelta} unit=" pts" />
        <GoalChip met={goalMet(Math.round(s.latest.score * 10) / 10, g)} text={g === null ? "" : score(g)} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {s.latest.review_count} comentarios · al {dmy(s.latest.recorded_on)}
        {age > 7 && <span className="ml-1 font-semibold text-amber-700">· desactualizado hace {age} días</span>}
      </p>
      <div className="mt-3 space-y-1.5">
        {REVIEW_CATEGORIES.filter(({ key }) => s.latest!.categories[key] != null).map(({ key, label }) => {
          const v = s.latest!.categories[key]!;
          const cg = h.goals.categories[key] ?? null;
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs">
                <span>{label}</span>
                <span className="font-semibold">
                  {score(v)} <Delta value={s.categoryDeltas[key] ?? null} />
                </span>
              </div>
              <div className="relative mt-0.5 h-1.5 rounded-full bg-slate-100">
                <div className={`h-1.5 rounded-full ${cg !== null && v < cg ? "bg-amber-500" : "bg-[#2a78d6]"}`} style={{ width: `${v * 10}%` }} />
                {cg !== null && <span className="absolute -top-0.5 h-2.5 w-0.5 bg-slate-700" style={{ left: `${cg * 10}%` }} title={`Meta ${score(cg)}`} />}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Pending({ h }: { h: HostelWeekly }) {
  const b = h.balances;
  return (
    <Panel>
      <HostelName h={h} />
      <p className="text-xs font-semibold text-slate-600">Cierres diarios pendientes</p>
      {h.pendingClosings.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {h.pendingClosings.map((d) => (
            <span key={d} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{dm(d)}</span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs font-semibold text-emerald-700">Todos los cierres al día</p>
      )}
      <p className="mt-3 text-xs font-semibold text-slate-600">Saldos por cobrar</p>
      <b className="text-2xl">{clp(b.total)}</b>
      {b.postpaid > 0 && <p className="text-[11px] text-slate-500">de los cuales {clp(b.postpaid)} son de empresas con pago posterior</p>}
      <ul className="mt-2 divide-y text-xs">
        {b.rows.slice(0, 5).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 py-1">
            <span className="min-w-0 truncate">
              <b>{r.room}</b> · {r.guest ?? "Sin nombre"}
            </span>
            <b className="shrink-0">{clp(r.balance)}</b>
          </li>
        ))}
        {!b.rows.length && <li className="py-1 text-slate-500">Sin saldos pendientes</li>}
      </ul>
      {b.rows.length > 5 && <p className="mt-1 text-[11px] text-slate-400">+ {b.rows.length - 5} reservas más</p>}
    </Panel>
  );
}

function Survey({ h }: { h: HostelWeekly }) {
  const s = h.survey;
  if (!s.count || s.overall === null)
    return (
      <Panel>
        <HostelName h={h} />
        <p className="text-sm text-slate-500">Sin respuestas de la encuesta QR en el período.</p>
      </Panel>
    );
  const g = s.goal;
  return (
    <Panel>
      <HostelName h={h} />
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-4xl leading-none">{score(s.overall)}</b>
        <span className="text-xs text-slate-500">de 5</span>
        <GoalChip met={g === null ? null : s.overall >= g} text={g === null ? "" : score(g)} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {s.count} {s.count === 1 ? "respuesta" : "respuestas"} · {pct(s.recommenders / s.count)} recomienda
      </p>
      <div className="mt-3 space-y-1.5">
        {s.categories.map((c) => {
          const weakest = s.weakest?.key === c.key;
          return (
            <div key={c.key}>
              <div className="flex items-center justify-between text-xs">
                <span className={weakest ? "font-semibold text-red-700" : ""}>{c.label}</span>
                <span className="font-semibold">{score(c.average)}</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
                <div className={`h-1.5 rounded-full ${weakest ? "bg-red-500" : "bg-[#2a78d6]"}`} style={{ width: `${((c.average - 1) / 4) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** Tablero de los hostales: una columna por hostal y una fila por indicador (como el PDF). */
export function HostelDashboard({ report, live = true }: { report: GroupWeeklyReport; live?: boolean }) {
  const hostels = report.hostels;
  const nightsSold = hostels.reduce((s, h) => s + h.month.nightsSold, 0);
  const roomNights = hostels.reduce((s, h) => s + h.month.roomNights, 0);
  const revenue = hostels.reduce((s, h) => s + h.month.revenue, 0);
  const soldNights = hostels.reduce((s, h) => s + h.month.soldNights, 0);
  const soldRevenue = hostels.reduce((s, h) => s + h.month.soldRevenue, 0);
  const received = hostels.reduce((s, h) => s + h.month.received, 0);
  const balances = hostels.reduce((s, h) => s + h.balances.total, 0);
  const pendingClosings = hostels.reduce((s, h) => s + h.pendingClosings.length, 0);
  const cards: [string, string, string][] = [
    ["Ocupación del grupo", roomNights ? pct(nightsSold / roomNights) : "—", `${nightsSold} de ${roomNights} noches`],
    ["Venta promedio", soldNights ? clp(soldRevenue / soldNights) : "—", "por noche vendida"],
    ["RevPAR", roomNights ? clp(revenue / roomNights) : "—", "venta por habitación disponible"],
    ["Venta del mes", clp(revenue), `recibido en caja ${clp(received)}`],
    ["Saldos por cobrar", clp(balances), "estadías del mes ya iniciadas"],
    ["Cierres pendientes", String(pendingClosings), pendingClosings ? "revisa la sección 5" : "todos al día"],
  ];
  const month = monthName(report.reference);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl border border-[#d9dfe6] bg-white p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <b className="mt-1 block text-2xl leading-none">{value}</b>
            <p className="mt-1.5 text-[11px] text-slate-500">{hint}</p>
          </div>
        ))}
      </div>
      <Section n={1} title="Ocupación del mes" note="habitaciones ocupadas por noche, del 1 al corte">
        {hostels.map((h) => <Occupancy key={h.unit.id} h={h} />)}
      </Section>
      <Section n={2} title="Venta promedio por habitación y RevPAR" note="acumulado del mes">
        {hostels.map((h) => <Revenue key={h.unit.id} h={h} live={live} />)}
      </Section>
      <Section n={3} title="Inspecciones" note={`limpiezas de ${month} hasta el corte`}>
        {hostels.map((h) => <Inspections key={h.unit.id} h={h} />)}
      </Section>
      <Section n={4} title="Puntaje en Booking" note="detalle por área; la marca negra es la meta">
        {hostels.map((h) => <Booking key={h.unit.id} h={h} reference={report.reference} />)}
      </Section>
      <Section n={5} title="Cierres pendientes y montos por cobrar" note={`cierres de ${month} hasta ayer`}>
        {hostels.map((h) => <Pending key={h.unit.id} h={h} />)}
      </Section>
      <Section n={6} title="Evaluación por QR" note={`encuesta de los huéspedes de ${month} hasta el corte · escala de 1 a 5`}>
        {hostels.map((h) => <Survey key={h.unit.id} h={h} />)}
      </Section>
      <p className="mt-6 text-[11px] text-slate-400">
        Del {dmy(report.monthStart)} al {dmy(report.reference)}. La ocupación y la venta de hoy se actualizan con las reservas y pagos que se vayan registrando.
      </p>
    </>
  );
}
