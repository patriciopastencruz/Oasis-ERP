import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { lodgingUnitCodes } from "@/config/business-units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { loadReceptionBonus, type UnitBonus } from "@/modules/lodging/application/bonus-queries";
import { saveBonusConfigAction, saveBonusResultAction } from "@/modules/lodging/application/bonus-actions";
import { clp, santiagoToday } from "@/modules/lodging/domain/daily-closing";
import { BONUS_INDICATORS, type BonusKey, type BonusStatus } from "@/modules/lodging/domain/reception-bonus";
import { parseHistoryMonth, shiftMonth } from "@/modules/lodging/domain/history-report";
import type { SupervisorStatus } from "@/modules/lodging/domain/supervisor-bonus";

export const dynamic = "force-dynamic";

const num = (v: number, d = 1) => v.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
function fmt(key: BonusKey, v: number | null) {
  if (v === null) return "—";
  if (key === "adr") return clp(v);
  if (key === "inspections") return `${Math.round(v)} min`;
  if (key === "order") return "—";
  if (key === "booking") return num(v, 1);
  if (key === "survey") return `${num(v, 2)} / 5`;
  return `${num(v, 1)}%`;
}
const statusUi: Record<BonusStatus, { text: string; cls: string }> = {
  met: { text: "✓ Cumple", cls: "bg-emerald-50 text-emerald-700" },
  half: { text: "½ Parcial", cls: "bg-amber-50 text-amber-800" },
  miss: { text: "✗ No cumple", cls: "bg-red-50 text-red-700" },
  na: { text: "No evaluado", cls: "bg-slate-100 text-slate-600" },
};
const supervisorStatusUi: Record<SupervisorStatus, { text: string; cls: string }> = {
  met: statusUi.met,
  half: { text: "Parcial", cls: "bg-amber-50 text-amber-800" },
  miss: statusUi.miss,
  na: statusUi.na,
};
const monthLabel = (month: string) => {
  const label = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const input = "mt-1 block w-full rounded-lg border bg-white px-2 py-1.5 text-sm";

function Detail({ b }: { b: UnitBonus }) {
  const r = b.result;
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#0b4f9c]">{b.unit.name}</p>
          <p className="mt-1 text-3xl font-bold leading-none">{clp(r.amount)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {num(r.points, 1)} de 100 puntos · bono máximo {clp(b.config.pool)}
            {r.gateApplied && <span className="ml-1 font-semibold text-red-700">· orden administrativo sin cumplir (bono al 50%: antes {clp(r.amountBeforeGate)})</span>}
          </p>
        </div>
        {b.saved && (
          <p className="max-w-xs rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
            Resultado guardado el {new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }).format(new Date(b.saved.savedAt))}:{" "}
            <b>{clp(b.saved.amount)}</b>
            {b.saved.amount !== r.amount && <span className="text-amber-700"> · con los datos de hoy daría {clp(r.amount)}</span>}
          </p>
        )}
      </div>

      {!b.config.configured && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Falta configurar el monto del bono de este hostal.</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1.5">Indicador</th>
              <th className="text-right">Valor</th>
              <th className="text-right">Meta</th>
              <th className="text-right">Peso</th>
              <th className="pl-3">Resultado</th>
              <th className="text-right">Puntos</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {r.rows.map((x) => (
              <tr key={x.key} className="align-top">
                <td className="py-2 font-medium">
                  {x.label}
                  {x.note && <span className="block text-[11px] font-normal text-slate-500">{x.note}</span>}
                  {x.criteria.map((c) => (
                    <span key={c.label} className={`block text-[11px] font-normal ${c.ok ? "text-emerald-700" : "text-red-700"}`}>
                      {c.ok ? "✓" : "✗"} {c.label}: {c.text}
                    </span>
                  ))}
                </td>
                <td className="text-right tabular-nums">{fmt(x.key, x.value)}</td>
                <td className="text-right tabular-nums text-slate-500">
                  {x.key === "inspections" ? `≤ ${x.goal} min` : x.goal === null ? "—" : fmt(x.key, x.goal)}
                </td>
                <td className="text-right tabular-nums">
                  {x.weight}
                  {x.status !== "na" && Math.round(x.effectiveWeight) !== x.weight && <span className="block text-[10px] text-slate-400">cuenta {num(x.effectiveWeight, 1)}</span>}
                </td>
                <td className="pl-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusUi[x.status].cls}`}>{statusUi[x.status].text}</span>
                </td>
                <td className="text-right font-semibold tabular-nums">{x.status === "na" ? "—" : num(x.earned, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-600">
        <b>Encuesta QR:</b> la mitad de sus puntos por reunir el mínimo de evaluaciones del mes y la otra mitad por llegar al promedio meta (el promedio solo cuenta con el mínimo reunido). <b>Cumple o no cumple, sin término medio:</b> la ocupación, la venta promedio y el puntaje de Booking deben alcanzar la meta del hostal; el aseo exige que todos los aseos terminados del mes se inspeccionen y que la inspección ocurra, en promedio, dentro de{" "}
        {b.config.inspectionMaxWait} minutos de terminado el aseo. El orden administrativo exige cierres diarios emitidos antes de las 06:00 del día siguiente y ninguna estadía terminada con saldo por cobrar
        (no cuentan las de empresa a crédito); deben cumplirse los dos criterios y, si no se cumple ninguno, además el bono completo se reduce a la mitad.
      </p>
    </Panel>
  );
}

function SupervisorDetail({ b }: { b: UnitBonus }) {
  const r = b.supervisor.result;
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#0b4f9c]">Bono del supervisor · {b.unit.name}</p>
          <p className="mt-1 text-3xl font-bold leading-none">{clp(r.amount)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {num(r.points, 1)} de 100 puntos · bono máximo {clp(b.config.supervisorPool)}
          </p>
        </div>
        {b.saved?.supervisorAmount != null && (
          <p className="max-w-xs rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
            Resultado guardado: <b>{clp(b.saved.supervisorAmount)}</b>
            {b.saved.supervisorAmount !== r.amount && <span className="text-amber-700"> · con los datos de hoy daría {clp(r.amount)}</span>}
          </p>
        )}
      </div>
      {b.config.supervisorPool === 0 && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Falta configurar el monto del bono del supervisor.</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1.5">Control</th>
              <th className="text-right">Peso</th>
              <th className="pl-3">Resultado</th>
              <th className="text-right">Puntos</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {r.rows.map((x) => (
              <tr key={x.key} className="align-top">
                <td className="py-2 font-medium">
                  {x.label}
                  <span className="block text-[11px] font-normal text-slate-500">{x.text}</span>
                </td>
                <td className="text-right tabular-nums">
                  {x.weight}
                  {x.status !== "na" && Math.round(x.effectiveWeight) !== x.weight && <span className="block text-[10px] text-slate-400">cuenta {num(x.effectiveWeight, 1)}</span>}
                </td>
                <td className="pl-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${supervisorStatusUi[x.status].cls}`}>{supervisorStatusUi[x.status].text}</span>
                </td>
                <td className="text-right font-semibold tabular-nums">{x.status === "na" ? "—" : num(x.earned, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-600">
        <b>Cómo se calcula:</b> 60 puntos son el puntaje de la recepción de su hostal (por ejemplo, 70 puntos de la recepción dan 42) y los otros 40 salen de cuatro controles de cumple o no cumple, 10 puntos cada uno:
        auditorías semanales completas, comprobantes con diferencia resueltos en 48 horas, máximo 10% de cierres corregidos y puntaje de Booking en la meta del hostal. Bono = monto × puntos ÷ 100.
      </p>
    </Panel>
  );
}

function ConfigForm({ b, canManage }: { b: UnitBonus; canManage: boolean }) {
  if (!canManage) return null;
  const c = b.config;
  return (
    <details className="rounded-2xl border border-[#d9dfe6] bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[#0b4f9c]">Configurar el bono de {b.unit.name}</summary>
      <form action={saveBonusConfigAction} className="mt-3 space-y-3">
        <input type="hidden" name="month" value={b.month} />
        <input type="hidden" name="unit_id" value={b.unit.id} />
        <label className="block text-sm">
          Monto del bono mensual (CLP)
          <input name="pool_amount" inputMode="numeric" defaultValue={c.pool} required className={input} />
        </label>
        <label className="block text-sm">
          Monto del bono del supervisor (CLP)
          <input name="supervisor_pool_amount" inputMode="numeric" defaultValue={c.supervisorPool} required className={input} />
        </label>
        <p className="text-xs font-semibold text-slate-600">Peso de cada indicador de recepción (deben sumar 100)</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BONUS_INDICATORS.map(({ key, label }) => (
            <label key={key} className="block text-xs">
              {label}
              <input name={`w_${key}`} type="number" min={0} max={100} defaultValue={c.weights[key]} required className={input} />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-xs">
            Meta encuesta (1 a 5)
            <input name="survey_goal" inputMode="decimal" defaultValue={String(c.surveyGoal).replace(".", ",")} required className={input} />
          </label>
          <label className="block text-xs">
            Mín. de respuestas
            <input name="survey_min_responses" type="number" min={0} defaultValue={c.surveyMinResponses} required className={input} />
          </label>
          <label className="block text-xs">
            Máx. minutos hasta la inspección
            <input name="inspection_max_wait_minutes" type="number" min={1} max={1440} defaultValue={c.inspectionMaxWait} required className={input} />
          </label>
        </div>
        <p className="text-[11px] text-slate-500">Las metas de ocupación, venta promedio y puntaje de Booking son las del reporte de los hostales.</p>
        <button className="rounded-xl bg-[#0b4f9c] px-4 py-2 text-sm font-semibold text-white">Guardar configuración</button>
      </form>
    </details>
  );
}

export default async function BonusPage({ searchParams }: { searchParams: Promise<{ month?: string; success?: string; error?: string }> }) {
  const q = await searchParams;
  const ctx = await requirePermission("kpis.view");
  const canManage = ctx.permissions.has("kpis.bonus.manage");
  const month = parseHistoryMonth(q.month);
  const units = lodgingUnitCodes
    .map((code) => ctx.units.find((u) => u.code === code))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }));
  const bonuses = units.length ? await loadReceptionBonus(await createSupabaseServerClient(), units, month) : [];
  const provisional = bonuses[0]?.provisional ?? true;
  const total = bonuses.reduce((s, b) => s + b.result.amount, 0);
  const supervisorTotal = bonuses.reduce((s, b) => s + b.supervisor.result.amount, 0);
  const currentMonth = santiagoToday().slice(0, 7);
  const href = (m: string) => `/kpis/bonos?month=${m}`;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Indicadores KPIs"
          title="Bono de recepción"
          description="Bono mensual por cumplimiento de metas, un monto fijo por hostal. Se calcula con los mismos indicadores del tablero y cada peso y monto se puede ajustar."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/kpis" className="rounded-xl border border-[#d9dfe6] bg-white px-3 py-1.5 text-xs font-semibold text-[#0b4f9c]">← Volver al tablero</Link>
          <a href={`/api/kpis/bonus.pdf?month=${month}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-[#0b4f9c] px-3 py-1.5 text-xs font-semibold text-[#0b4f9c]">
            <Download size={14} /> PDF de respaldo
          </a>
        </div>
      </div>

      {(q.success || q.error) && (
        <p className={`mb-4 rounded-xl p-3 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{q.error || q.success}</p>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Link href={href(shiftMonth(month, -1))} className="rounded-lg border bg-white px-3 py-1.5">←</Link>
        <span className="min-w-40 text-center font-semibold">{monthLabel(month)}</span>
        {month < currentMonth && <Link href={href(shiftMonth(month, 1))} className="rounded-lg border bg-white px-3 py-1.5">→</Link>}
        <span className={`ml-2 rounded-full px-2.5 py-1 text-xs font-semibold ${provisional ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
          {provisional ? "Provisorio: el mes aún no termina" : "Mes terminado"}
        </span>
      </div>

      {!bonuses.length ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No tienes hostales asignados.</p>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {bonuses.map((b) => (
              <div key={b.unit.id} className="rounded-2xl border border-[#d9dfe6] bg-white p-4">
                <p className="text-xs text-slate-500">{b.unit.name}</p>
                <b className="mt-1 block text-2xl leading-none">{clp(b.result.amount)}</b>
                <p className="mt-1.5 text-[11px] text-slate-500">Recepción: {num(b.result.points, 1)} puntos de 100 · máximo {clp(b.config.pool)}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Supervisor: <b>{clp(b.supervisor.result.amount)}</b> · {num(b.supervisor.result.points, 1)} puntos</p>
              </div>
            ))}
            <div className="rounded-2xl border border-[#0b4f9c] bg-[#edf4fc] p-4">
              <p className="text-xs text-slate-600">Total a pagar {provisional ? "(provisorio)" : ""}</p>
              <b className="mt-1 block text-2xl leading-none">{clp(total + supervisorTotal)}</b>
              <p className="mt-1.5 text-[11px] text-slate-500">Recepción {clp(total)} · Supervisores {clp(supervisorTotal)}</p>
            </div>
          </div>

          <div className="space-y-5">
            {bonuses.map((b) => (
              <div key={b.unit.id} className="space-y-2">
                <Detail b={b} />
                <SupervisorDetail b={b} />
                {canManage && !provisional && (
                  <form action={saveBonusResultAction} className="flex justify-end">
                    <input type="hidden" name="month" value={month} />
                    <input type="hidden" name="unit_id" value={b.unit.id} />
                    <ConfirmButton
                      message={`¿Guardar el resultado de ${b.unit.name} de ${monthLabel(month)}? Queda como respaldo del pago (recepción ${clp(b.result.amount)}, supervisor ${clp(b.supervisor.result.amount)}); puedes volver a guardarlo si corriges datos.`}
                      className="rounded-xl border border-[#0b4f9c] px-3 py-1.5 text-xs font-semibold text-[#0b4f9c]"
                    >
                      {b.saved ? "Actualizar resultado guardado" : "Guardar resultado del mes"}
                    </ConfirmButton>
                  </form>
                )}
                <ConfigForm b={b} canManage={canManage} />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
