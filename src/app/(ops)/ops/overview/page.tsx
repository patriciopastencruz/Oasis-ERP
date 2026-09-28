import Link from "next/link";
import { redirect } from "next/navigation";
import { AttentionList } from "@/components/ops/attention-list";
import { loadAuditWeek, loadBoards, opsContext } from "@/modules/lodging/application/ops-queries";
import { selectOpsUnitAction } from "@/modules/lodging/application/ops-actions";
import { healthLine, roomAttention, sortAttention, unitOverview, type UnitOverview } from "@/modules/lodging/domain/attention";

const rows: [string, (u: UnitOverview) => number][] = [
  ["Habitaciones", (u) => u.total],
  ["Ocupadas", (u) => u.occupied],
  ["Disponibles", (u) => u.available],
  ["Por limpiar", (u) => u.counts.dirty],
  ["En limpieza", (u) => u.counts.cleaning],
  ["Por inspeccionar", (u) => u.counts.pending_inspection],
  ["Inspeccionadas", (u) => u.counts.inspected],
  ["Mantención", (u) => u.counts.maintenance],
  ["Fuera de servicio", (u) => u.counts.out_of_service],
  ["Llegadas hoy", (u) => u.arrivals],
  ["Salidas hoy", (u) => u.departures],
  ["Incidencias abiertas", (u) => u.incidents],
];

/** Operación consolidada de todos los hostales asignados (gestión por excepción). */
export default async function OverviewPage() {
  const { units, unit, can, supabase } = await opsContext();
  if (!can.operations) redirect("/ops");
  const now = new Date();
  const [boards, week] = await Promise.all([
    loadBoards(supabase, (can.multiUnit ? units : [unit]).map((u) => u.id)),
    can.auditView ? loadAuditWeek(supabase).catch(() => null) : Promise.resolve(null),
  ]);
  const attention = sortAttention(boards.flatMap((b) => roomAttention(b, now)));
  const overviews = boards.map((b) => unitOverview(b, attention));
  const pendingAudits = (id: string) => week?.units.find((u) => u.id === id)?.pending ?? null;
  const total = (f: (u: UnitOverview) => number) => overviews.reduce((sum, u) => sum + f(u), 0);
  const multi = overviews.length > 1;
  const alertsOf = (id: string) => attention.filter((i) => i.unitId === id).length;

  return (
    <>
      <Link href="/ops" className="mb-3 inline-block text-sm font-semibold text-[#0b4f9c]">
        ← Volver
      </Link>
      <h1 className="mb-4 text-2xl font-bold">Operación consolidada</h1>

      <div className="mb-6 overflow-x-auto rounded-3xl bg-white shadow-sm">
        <table className="w-full text-[13px]">
          <caption className="sr-only">Estado operacional por hostal</caption>
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-3 font-semibold text-slate-500" scope="col" />
              {overviews.map((u) => (
                <th key={u.id} scope="col" className="px-1.5 py-3 text-right">
                  <form action={selectOpsUnitAction}>
                    <input type="hidden" name="unit_id" value={u.id} />
                    <button className="font-bold text-[#0b4f9c] underline decoration-slate-300 underline-offset-2">{u.name}</button>
                  </form>
                </th>
              ))}
              {multi && (
                <th scope="col" className="py-3 pl-1.5 pr-3 text-right font-bold">
                  Total
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y tabular-nums">
            {rows.map(([label, f]) => (
              <tr key={label}>
                <th scope="row" className="py-2 pl-3 pr-1 text-left font-medium leading-tight text-slate-600">
                  {label}
                </th>
                {overviews.map((u) => (
                  <td key={u.id} className="px-1.5 py-2 text-right font-semibold">
                    {f(u)}
                  </td>
                ))}
                {multi && <td className="py-2 pl-1.5 pr-3 text-right font-bold">{total(f)}</td>}
              </tr>
            ))}
            {week && (
              <tr>
                <th scope="row" className="py-2 pl-3 pr-1 text-left font-medium leading-tight text-slate-600">
                  Auditorías pendientes
                </th>
                {overviews.map((u) => (
                  <td key={u.id} className="px-1.5 py-2 text-right font-semibold">
                    {pendingAudits(u.id) ?? "—"}
                  </td>
                ))}
                {multi && <td className="py-2 pl-1.5 pr-3 text-right font-bold">{overviews.reduce((s, u) => s + (pendingAudits(u.id) ?? 0), 0)}</td>}
              </tr>
            )}
            <tr>
              <th scope="row" className="py-2 pl-3 pr-1 text-left font-medium leading-tight text-slate-600">
                Estado
              </th>
              {overviews.map((u) => {
                const h = healthLine(u);
                return (
                  <td key={u.id} className={`px-1.5 py-2 text-right text-xs font-bold ${h.ok ? "text-emerald-700" : u.critical ? "text-red-700" : "text-amber-800"}`}>
                    {h.ok ? "✓ Normal" : `⚠ ${alertsOf(u.id)} alerta${alertsOf(u.id) === 1 ? "" : "s"}`}
                  </td>
                );
              })}
              {multi && <td />}
            </tr>
          </tbody>
        </table>
      </div>

      <AttentionList items={attention} currentUnitId={unit.id} showUnit={multi} limit={100} />
    </>
  );
}
