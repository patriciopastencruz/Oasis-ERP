import Link from "next/link";
import { Bell, ChevronDown } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/finance/status-badge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { approvableSteps } from "@/modules/finance/payment-control/application/approval-queries";
import { markNotificationReadAction } from "@/modules/finance/payment-control/application/approval-actions";
const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
export default async function Approvals({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("finance.approvals.decide");
  const p = await searchParams,
    page = Math.max(1, Number(p.page) || 1),
    size = 10;
  const s = await createSupabaseServerClient();
  const all = await approvableSteps();
  let rows = all.filter((x) => {
    const r = Array.isArray(x.payment_requests)
      ? x.payment_requests[0]
      : x.payment_requests;
    const profile = Array.isArray(r?.profiles) ? r.profiles[0] : r?.profiles;
    const text =
      `${r?.request_number} ${r?.supplier_legal_name} ${profile?.first_name} ${profile?.last_name}`.toLowerCase();
    return (
      (!p.q || text.includes(p.q.toLowerCase())) &&
      (!p.unit || r?.business_unit_id === p.unit) &&
      (!p.priority || r?.priority === p.priority) &&
      (!p.status || r?.status === p.status) &&
      (!p.min || Number(r?.amount) >= Number(p.min)) &&
      (!p.max || Number(r?.amount) <= Number(p.max)) &&
      (!p.from || String(r?.created_at) >= p.from) &&
      (!p.to || String(r?.created_at).slice(0, 10) <= p.to)
    );
  });
  rows.sort((a, b) => {
    const ar = Array.isArray(a.payment_requests)
        ? a.payment_requests[0]
        : a.payment_requests,
      br = Array.isArray(b.payment_requests)
        ? b.payment_requests[0]
        : b.payment_requests;
    return p.sort === "oldest"
      ? String(ar?.created_at).localeCompare(String(br?.created_at))
      : String(br?.updated_at).localeCompare(String(ar?.updated_at));
  });
  const total = rows.length,
    pages = Math.max(1, Math.ceil(total / size));
  rows = rows.slice((page - 1) * size, page * size);
  const today = new Date().toISOString().slice(0, 10);
  const { data: myDecisions } = await s
    .from("payment_request_approval_decisions")
    .select(
      "action,created_at,approval_step_id,payment_request_approval_steps(created_at)",
    )
    .eq("approver_id", ctx.user.id)
    .gte("created_at", `${today}T00:00:00`);
  const responseTimes = (myDecisions ?? [])
    .map((d) => {
      const st = Array.isArray(d.payment_request_approval_steps)
        ? d.payment_request_approval_steps[0]
        : d.payment_request_approval_steps;
      return st
        ? (new Date(d.created_at).getTime() -
            new Date(st.created_at).getTime()) /
            36e5
        : null;
    })
    .filter((x): x is number => x !== null);
  const { data: notifications } = await s
    .from("notifications")
    .select("id,title,body,entity_id,created_at,status")
    .eq("recipient_id", ctx.user.id)
    .eq("status", "unread")
    .order("created_at", { ascending: false })
    .limit(5);
  return (
    <>
      <PageHeader
        title="Bandeja de aprobaciones"
        description="Solicitudes disponibles según workflow, etapa, permisos y contexto."
        eyebrow="Finanzas · Gestión de Pagos"
      />
      <details className="group/notifications mb-5">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-xl border border-[#dce4df] bg-white px-4 py-2.5 text-sm font-semibold text-[#173f2d] shadow-sm transition hover:bg-[#edf5f0] [&::-webkit-details-marker]:hidden">
          <Bell size={17} />
          Notificaciones
          {(notifications?.length ?? 0) > 0 && (
            <span className="grid min-w-5 place-items-center rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">
              {notifications?.length}
            </span>
          )}
          <ChevronDown
            size={15}
            className="transition-transform group-open/notifications:rotate-180"
          />
        </summary>
        <Panel className="mt-3">
          {(notifications?.length ?? 0) > 0 ? (
            <div className="space-y-2">
              {notifications?.map((n) => (
                <div
                  key={n.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm"
                >
                  <Link
                    href={`/finance/payment-control/approvals/${n.entity_id}`}
                  >
                    <b>{n.title}</b>
                    <span className="ml-2">{n.body}</span>
                  </Link>
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button className="font-semibold text-[#277a55]">
                      Marcar leída
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#718078]">
              No tienes notificaciones pendientes.
            </p>
          )}
        </Panel>
      </details>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Pendientes" value={all.length} />
        <Kpi
          label="Urgentes"
          value={
            all.filter(
              (x) =>
                (Array.isArray(x.payment_requests)
                  ? x.payment_requests[0]
                  : x.payment_requests
                )?.priority === "urgent",
            ).length
          }
        />
        <Kpi
          label="Aprobadas hoy"
          value={
            (myDecisions ?? []).filter((x) => x.action === "approve").length
          }
        />
        <Kpi
          label="Rechazadas hoy"
          value={
            (myDecisions ?? []).filter((x) => x.action === "reject").length
          }
        />
        <Kpi
          label="Respuesta promedio"
          value={
            responseTimes.length
              ? `${(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1)} h`
              : "—"
          }
        />
      </div>
      <Panel>
        <form className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
          <input
            name="q"
            defaultValue={p.q}
            placeholder="Correlativo, proveedor o solicitante"
            className="rounded-xl border p-2 text-sm xl:col-span-2"
          />
          <select
            name="unit"
            defaultValue={p.unit}
            className="rounded-xl border p-2 text-sm"
          >
            <option value="">Unidades</option>
            {ctx.units.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <select
            name="priority"
            defaultValue={p.priority}
            className="rounded-xl border p-2 text-sm"
          >
            <option value="">Prioridad</option>
            <option value="urgent">Urgente</option>
            <option value="normal">Normal</option>
            <option value="scheduled">Programado</option>
          </select>
          <input
            name="min"
            type="number"
            placeholder="Monto mín."
            className="rounded-xl border p-2 text-sm"
          />
          <input
            name="max"
            type="number"
            placeholder="Monto máx."
            className="rounded-xl border p-2 text-sm"
          />
          <button className="rounded-xl bg-[#173f2d] text-sm text-white">
            Filtrar
          </button>
        </form>
      </Panel>
      <Panel className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead>
              <tr>
                <th className="pb-3">Solicitud</th>
                <th>Solicitante</th>
                <th>Unidad</th>
                <th>Monto</th>
                <th>Prioridad</th>
                <th>Etapa</th>
                <th>Revisión</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const r = Array.isArray(x.payment_requests)
                    ? x.payment_requests[0]
                    : x.payment_requests,
                  profile = Array.isArray(r?.profiles)
                    ? r.profiles[0]
                    : r?.profiles,
                  unit = Array.isArray(r?.business_units)
                    ? r.business_units[0]
                    : r?.business_units,
                  instance = Array.isArray(x.payment_request_approval_instances)
                    ? x.payment_request_approval_instances[0]
                    : x.payment_request_approval_instances;
                return (
                  <tr key={x.id} className="border-t">
                    <td className="py-4">
                      <b>{r?.request_number}</b>
                      <small className="block">{r?.supplier_legal_name}</small>
                    </td>
                    <td>
                      {profile?.first_name} {profile?.last_name}
                    </td>
                    <td>{unit?.name}</td>
                    <td>{money.format(Number(r?.amount))}</td>
                    <td>
                      <StatusBadge value={String(r?.priority)} />
                    </td>
                    <td>{x.step_name_snapshot}</td>
                    <td>{instance?.revision}</td>
                    <td>
                      <Link
                        href={`/finance/payment-control/approvals/${r?.id}`}
                        className="font-semibold text-[#277a55]"
                      >
                        Revisar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="py-14 text-center text-sm text-slate-500">
            No tienes aprobaciones pendientes con estos filtros.
          </p>
        )}
        <div className="mt-4 flex justify-between border-t pt-4 text-sm">
          <span>
            Página {page} de {pages} · {total} pendientes
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={{ query: { ...p, page: page - 1 } }}
                className="rounded-lg border px-3 py-1"
              >
                Anterior
              </Link>
            )}
            {page < pages && (
              <Link
                href={{ query: { ...p, page: page + 1 } }}
                className="rounded-lg border px-3 py-1"
              >
                Siguiente
              </Link>
            )}
          </div>
        </div>
      </Panel>
    </>
  );
}
function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <b className="mt-2 block text-2xl">{value}</b>
    </div>
  );
}
