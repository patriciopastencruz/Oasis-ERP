import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { MonthlyLineForm } from "@/components/lodging/monthly-line-form";
import { deleteLineAction, startMonthAction, toggleLineStatusAction } from "@/modules/lodging/application/monthly-actions";
import { clp } from "@/modules/lodging/domain/daily-closing";
import { monthLabel, nextMonth, previousMonth, sectionLabels, sectionOrder, type MonthlyPreparation } from "@/modules/lodging/domain/monthly-closing";

/**
 * Preparación del cierre mensual para administración: iniciar el mes, cargar
 * ingresos, costos, inversiones y retiros, y controlar los cierres diarios.
 * Sin ventas, totales, utilidad ni informe: eso es de gerencia.
 */
export function MonthlyPreparationView({
  unitName,
  month,
  currentMonth,
  data,
  editId,
  message,
}: {
  unitName: string;
  month: string;
  currentMonth: string;
  data: MonthlyPreparation;
  editId?: string;
  message?: { kind: "success" | "error"; text: string };
}) {
  const { closing, lines, categories, daily_closings: daily } = data;
  const editable = closing?.status === "draft";
  const editing = lines.find((l) => l.id === editId);
  const missing = Math.max(0, daily.days - daily.issued);
  const pending = lines.filter((l) => l.payment_status === "pendiente").length;

  return (
    <>
      <PageHeader
        eyebrow={unitName}
        title="Preparación del cierre mensual"
        description="Carga los ingresos, costos fijos y variables, inversiones y retiros del mes. Las ventas y los gastos de los cierres diarios se suman solos. El informe completo lo revisa y cierra gerencia."
      />
      {message && (
        <p className={`mb-4 rounded-xl p-3 text-sm ${message.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{message.text}</p>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/lodging/monthly?month=${previousMonth(month)}`} aria-label="Mes anterior" className="grid size-10 place-items-center rounded-xl border bg-white">
          <ChevronLeft size={18} />
        </Link>
        <span className="min-w-36 text-center text-sm font-semibold capitalize">{monthLabel(month)}</span>
        {month < currentMonth && (
          <Link href={`/lodging/monthly?month=${nextMonth(month)}`} aria-label="Mes siguiente" className="grid size-10 place-items-center rounded-xl border bg-white">
            <ChevronRight size={18} />
          </Link>
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            !closing ? "bg-slate-100 text-slate-600" : closing.status === "closed" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
          }`}
        >
          {!closing ? "Sin iniciar" : closing.status === "closed" ? "Cerrado por gerencia" : "En preparación"}
        </span>
        <Link href="/lodging/monthly/categories" className="ml-auto rounded-xl border bg-white px-4 py-2 text-sm font-semibold">
          Categorías
        </Link>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#d9dfe6] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cierres diarios emitidos</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {daily.issued} / {daily.days}
          </p>
          <p className={`mt-0.5 text-xs font-semibold ${missing ? "text-amber-800" : "text-emerald-700"}`}>
            {missing ? `Faltan ${missing} día(s) por cerrar` : "Todos los días cerrados"}
          </p>
        </div>
        <div className="rounded-2xl border border-[#d9dfe6] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Líneas cargadas</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{lines.length}</p>
          <p className="mt-0.5 text-xs text-slate-500">{pending ? `${pending} pendiente(s) de pago` : "Sin pagos pendientes"}</p>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-[#c9d3df] bg-[#f7f9fc] p-4 text-sm text-slate-600">
          <Lock size={18} className="mt-0.5 shrink-0 text-slate-400" />
          <p>El estado de resultados, la utilidad y el informe del mes los ve gerencia.</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Panel className="min-w-0">
          <h2 className="mb-3 font-semibold">Líneas del mes</h2>
          {!closing ? (
            <p className="text-sm text-slate-500">Inicia el cierre del mes para cargar sus líneas.</p>
          ) : !lines.length ? (
            <p className="text-sm text-slate-500">Todavía no hay líneas cargadas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <tbody>
                  {sectionOrder.map((s) => {
                    const own = lines.filter((l) => l.section === s);
                    if (!own.length) return null;
                    return (
                      <SectionLines key={s} title={sectionLabels[s]} lines={own} month={month} editable={editable} />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          {!closing && (
            <Panel>
              <h2 className="font-semibold">Iniciar cierre de {monthLabel(month)}</h2>
              <p className="mt-2 text-sm text-slate-500">Se crea el borrador y se copian los costos fijos del último mes como pendientes de pago.</p>
              <form action={startMonthAction} className="mt-3">
                <input type="hidden" name="month" value={month} />
                <button className="w-full rounded-xl bg-[#0b4f9c] px-4 py-3 text-sm font-semibold text-white">Iniciar cierre</button>
              </form>
            </Panel>
          )}
          {editable && closing && (
            <Panel>
              <h2 className="mb-3 font-semibold">{editing ? "Editar línea" : "Agregar ingreso o gasto"}</h2>
              <MonthlyLineForm month={month} closingId={closing.id} categories={categories} editing={editing} />
            </Panel>
          )}
          {closing?.status === "closed" && (
            <Panel>
              <h2 className="font-semibold">Mes cerrado por gerencia</h2>
              <p className="mt-1 text-sm text-slate-500">
                {closing.closed_at && new Date(closing.closed_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}. Para corregir una línea, pide a gerencia que
                reabra el mes.
              </p>
            </Panel>
          )}
          {closing?.status === "draft" && (
            <Panel>
              <h2 className="font-semibold">Antes de entregar a gerencia</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                <li>Todos los días del mes con cierre diario emitido.</li>
                <li>Arriendos, sueldos, servicios y demás costos fijos cargados.</li>
                <li>Inversiones y retiros del mes registrados.</li>
                <li>Pagos pendientes marcados como pagados cuando corresponda.</li>
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function SectionLines({ title, lines, month, editable }: { title: string; lines: MonthlyPreparation["lines"]; month: string; editable: boolean }) {
  return (
    <>
      <tr className="bg-[#eef3f9]">
        <td colSpan={4} className="px-2 py-2 font-bold uppercase">
          {title}
        </td>
      </tr>
      {lines.map((l) => (
        <tr key={l.id} className="border-t">
          <td className="py-1.5 pl-4 pr-2">
            <span className="text-xs font-semibold text-slate-500">{l.category}</span>
            <br />
            {l.description}
            {l.payer ? <span className="text-xs text-slate-500"> · {l.payer}</span> : null}
          </td>
          <td className="text-right tabular-nums">{clp(l.amount)}</td>
          <td className="pl-3 text-right text-xs">
            {editable ? (
              <form action={toggleLineStatusAction} className="inline">
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="line_id" value={l.id} />
                <button
                  title="Cambiar estado de pago"
                  className={`rounded-full px-2 py-0.5 font-semibold ${l.payment_status === "pendiente" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}
                >
                  {l.payment_status === "pendiente" ? "Pendiente" : "Pagado"}
                </button>
              </form>
            ) : (
              <span className={l.payment_status === "pendiente" ? "font-semibold text-amber-800" : "text-slate-500"}>{l.payment_status === "pendiente" ? "Pendiente" : "Pagado"}</span>
            )}
          </td>
          <td className="w-28 pl-3 text-right text-xs">
            {editable && (
              <span className="inline-flex gap-2">
                <Link href={`/lodging/monthly?month=${month}&edit=${l.id}`} className="font-semibold text-[#0b4f9c]">
                  Editar
                </Link>
                <form action={deleteLineAction} className="inline">
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="line_id" value={l.id} />
                  <ConfirmButton message="¿Eliminar esta línea?" className="font-semibold text-red-700">
                    Quitar
                  </ConfirmButton>
                </form>
              </span>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
