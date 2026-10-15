import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { lodgingUnitCodes } from "@/config/business-units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
import { redirect } from "next/navigation";
import { decideClosingAuthorizationAction } from "@/modules/lodging/application/closing-authorization-actions";
import { isAuthorizationActive, listClosingAuthorizations } from "@/modules/lodging/application/closing-authorization-queries";
import { formatClosingDate } from "@/modules/lodging/domain/daily-closing";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
const person = (p: { first_name: string | null; last_name: string | null } | null) =>
  p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Usuario" : "—";

/** Solicitudes de recepción para cerrar fechas anteriores a ayer. */
export default async function ClosingAuthorizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const q = await searchParams;
  const ctx = await requireSession();
  const canAuthorize = ctx.permissions.has("lodging.closings.authorize");
  if (!canAuthorize && !ctx.permissions.has("lodging.closings.create")) redirect("/no-access");
  const units = ctx.units.filter((u) => lodgingUnitCodes.includes(u.code));
  const supabase = await createSupabaseServerClient();
  const rows = await listClosingAuthorizations(supabase, units.map((u) => u.id));
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? "—";
  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");
  const input = "w-full rounded-lg border border-[#d9dfe6] px-3 py-2 text-sm";

  return (
    <>
      <PageHeader
        eyebrow="Hospedaje"
        title="Autorizaciones de cierre"
        description="Recepción cierra el día de hoy y el anterior. Para fechas más antiguas pide autorización; una vez aprobada tiene 48 horas para preparar y emitir el cierre."
      />
      {(q.success || q.error) && (
        <p className={`mb-4 rounded-xl p-3 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {q.error || q.success}
        </p>
      )}

      <Panel className="mb-5">
        <h2 className="font-semibold">Pendientes ({pending.length})</h2>
        {!pending.length ? (
          <p className="mt-2 text-sm text-slate-500">No hay solicitudes pendientes.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">
                    {unitName(r.business_unit_id)} · cierre del {formatClosingDate(r.closing_date)}
                  </p>
                  <span className="text-xs text-slate-500">
                    {person(r.requester)} · {when(r.requested_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700">Motivo: {r.reason}</p>
                {canAuthorize && (
                  <div className="mt-3 flex flex-wrap items-start gap-3">
                    <form action={decideClosingAuthorizationAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <button className="rounded-xl bg-[#0b4f9c] px-4 py-2 text-sm font-semibold text-white">Autorizar 48 horas</button>
                    </form>
                    <form action={decideClosingAuthorizationAction} className="flex min-w-[260px] flex-1 gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <input name="notes" required minLength={3} maxLength={500} placeholder="Motivo del rechazo" className={input} />
                      <button className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Rechazar</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <h2 className="font-semibold">Historial</h2>
        {!decided.length ? (
          <p className="mt-2 text-sm text-slate-500">Aún no hay solicitudes resueltas.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1.5">Hostal</th>
                  <th>Fecha</th>
                  <th>Pidió</th>
                  <th>Estado</th>
                  <th>Resolvió</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {decided.map((r) => {
                  const active = isAuthorizationActive(r);
                  return (
                    <tr key={r.id}>
                      <td className="py-2">{unitName(r.business_unit_id)}</td>
                      <td>{formatClosingDate(r.closing_date)}</td>
                      <td title={r.reason}>{person(r.requester)}</td>
                      <td>
                        {r.status === "rejected" ? (
                          <span className="font-semibold text-red-700" title={r.decision_notes ?? ""}>Rechazada</span>
                        ) : active ? (
                          <span className="font-semibold text-emerald-700">Autorizada hasta {when(r.expires_at!)}</span>
                        ) : (
                          <span className="text-slate-500">Autorizada (vencida)</span>
                        )}
                      </td>
                      <td className="text-slate-500">
                        {person(r.decider)}
                        {r.decided_at ? ` · ${when(r.decided_at)}` : ""}
                      </td>
                      <td className="text-right">
                        {active && (
                          <Link href={`/lodging/closing?date=${r.closing_date}`} className="font-semibold text-[#0b4f9c]">
                            Ir al cierre
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
