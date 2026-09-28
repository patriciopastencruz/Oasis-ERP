import Link from "next/link";
import { selectOpsUnitAction } from "@/modules/lodging/application/ops-actions";
import { healthLine, type UnitOverview } from "@/modules/lodging/domain/attention";

/** MIS HOSTALES: estado de cada hostal y cambio de hostal en un toque. */
export function MyUnits({ units, currentUnitId, audits }: { units: UnitOverview[]; currentUnitId: string; audits?: Record<string, { done: number; target: number }> }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Mis hostales</h2>
        <Link href="/ops/overview" className="text-xs font-bold text-[#0b4f9c]">
          Vista consolidada →
        </Link>
      </div>
      <div className="space-y-2">
        {units.map((u) => {
          const health = healthLine(u);
          const audit = audits?.[u.id];
          const current = u.id === currentUnitId;
          return (
            <form key={u.id} action={selectOpsUnitAction}>
              <input type="hidden" name="unit_id" value={u.id} />
              <button
                className={`w-full rounded-3xl bg-white p-4 text-left shadow-sm ${current ? "ring-2 ring-[#2a78d6]" : ""}`}
                aria-current={current ? "true" : undefined}
                aria-label={`Ver ${u.name}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold uppercase tracking-wide">{u.name}</p>
                    <p className={`text-sm font-semibold ${health.ok ? "text-emerald-700" : u.critical ? "text-red-700" : "text-amber-800"}`}>
                      {health.ok ? "✓ " : "⚠ "}
                      {health.text}
                    </p>
                  </div>
                  {audit && (
                    <p className="shrink-0 text-right text-xs text-slate-500">
                      Auditorías
                      <br />
                      <b className="text-base tabular-nums text-slate-800">
                        {audit.done}/{audit.target}
                      </b>
                    </p>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {u.available} disponibles · {u.counts.dirty} por limpiar · {u.counts.pending_inspection} por inspeccionar · {u.arrivals} llegadas hoy
                </p>
              </button>
            </form>
          );
        })}
      </div>
    </section>
  );
}
