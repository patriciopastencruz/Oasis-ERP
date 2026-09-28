import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import {
  lodgingContext,
  formatDate,
  clp,
} from "@/modules/lodging/application/queries";
export default async function Page() {
  const { ctx, unit, supabase } = await lodgingContext();
  const { data } = await supabase
    .from("lodging_reservations")
    .select(
      "id,origin,status,check_in,check_out,total_value,information_complete,lodging_rooms(name),lodging_guests(full_name)",
    )
    .eq("business_unit_id", unit.id)
    .order("check_in", { ascending: false })
    .limit(100);
  // Anulaciones por aprobar (administrador o superior).
  const { data: pendingCancellations } = ctx.permissions.has("lodging.reservations.cancel_approve")
    ? await supabase
        .from("lodging_reservation_cancellations")
        .select("id,reason,requested_at,reservation_id,lodging_reservations(check_in,check_out,lodging_rooms(name),lodging_guests(full_name))")
        .eq("business_unit_id", unit.id)
        .eq("status", "pending")
        .order("requested_at")
    : { data: [] };
  const pendingWebRequests = (data ?? []).filter(
    (r) => r.origin === "public_web" && r.status === "pending",
  ).length;
  return (
    <>
      <div className="flex justify-between gap-4">
        <PageHeader
          eyebrow={unit.name}
          title="Reservas"
          description="Reservas directas e importadas, con información operativa centralizada."
        />
        <Link
          href="/lodging/reservations/new"
          className="mt-1 inline-flex h-11 items-center gap-2 rounded-xl bg-[#0b4f9c] px-4 text-sm font-semibold text-white"
        >
          <Plus size={16} />
          Nueva reserva
        </Link>
      </div>
      {(pendingCancellations ?? []).length > 0 && (
        <Panel className="mb-4 border-amber-300 bg-amber-50">
          <h2 className="font-semibold text-amber-900">Anulaciones por aprobar · {(pendingCancellations ?? []).length}</h2>
          <ul className="mt-2 divide-y divide-amber-200 text-sm">
            {(pendingCancellations ?? []).map((c) => {
              const res = Array.isArray(c.lodging_reservations) ? c.lodging_reservations[0] : c.lodging_reservations;
              const room = res ? (Array.isArray(res.lodging_rooms) ? res.lodging_rooms[0] : res.lodging_rooms) : null;
              const guest = res ? (Array.isArray(res.lodging_guests) ? res.lodging_guests[0] : res.lodging_guests) : null;
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <b>{guest?.full_name ?? "Sin nombre"}</b> · {room?.name} · {res ? `${formatDate(res.check_in)} → ${formatDate(res.check_out)}` : ""}
                    <span className="block text-xs text-amber-800">Motivo: {c.reason}</span>
                  </span>
                  <Link href={`/lodging/reservations/${c.reservation_id}`} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#0b4f9c] ring-1 ring-amber-300">
                    Revisar
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      {pendingWebRequests > 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Tienes <b>{pendingWebRequests}</b>{" "}
          {pendingWebRequests === 1
            ? "solicitud web pendiente"
            : "solicitudes web pendientes"}{" "}
          de revisión (marcadas abajo).
        </p>
      )}
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-slate-500">
              <th className="pb-3">Huésped</th>
              <th>Habitación</th>
              <th>Estadía</th>
              <th>Origen</th>
              <th>Estado</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r) => {
              const guest = Array.isArray(r.lodging_guests)
                ? r.lodging_guests[0]
                : r.lodging_guests;
              const room = Array.isArray(r.lodging_rooms)
                ? r.lodging_rooms[0]
                : r.lodging_rooms;
              const isPendingWebRequest =
                r.origin === "public_web" && r.status === "pending";
              return (
                <tr
                  key={r.id}
                  className={`border-b last:border-0 ${isPendingWebRequest ? "bg-amber-50" : ""}`}
                >
                  <td className="py-3">
                    <Link
                      href={`/lodging/reservations/${r.id}`}
                      className="font-semibold text-[#0b4f9c]"
                    >
                      {guest?.full_name ||
                        `Reserva ${r.origin} — información pendiente`}
                    </Link>
                    {isPendingWebRequest && (
                      <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                        Por revisar
                      </span>
                    )}
                  </td>
                  <td>{room?.name}</td>
                  <td>
                    {formatDate(r.check_in)} → {formatDate(r.check_out)}
                  </td>
                  <td>{uiLabel(r.origin)}</td>
                  <td
                    className={
                      r.status === "conflict"
                        ? "font-semibold text-red-600"
                        : ""
                    }
                  >
                    {uiLabel(r.status)}
                  </td>
                  <td className="text-right">
                    {clp.format(Number(r.total_value))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
