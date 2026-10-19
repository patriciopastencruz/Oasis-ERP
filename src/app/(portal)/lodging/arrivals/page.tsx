import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import { ArrivalContactButton } from "@/components/lodging/arrival-contact-button";
import { saveArrivalInfoAction, saveRoomCodesAction } from "@/modules/lodging/application/arrival-actions";
import { needsRoomCode } from "@/modules/lodging/domain/arrival-message";
import { lodgingContext, clp } from "@/modules/lodging/application/queries";
import { operationalStatusLabels, operationalStatusTone, type OperationalStatus } from "@/modules/lodging/domain/operations";

type Payment = { amount: number; type: string; status: string };
const one = <T,>(value: T | T[] | null) => (Array.isArray(value) ? value[0] : value);
const paidOf = (payments: Payment[] | null) =>
  (payments ?? [])
    .filter((p) => p.status === "confirmed")
    .reduce((n, p) => n + (p.type === "refund" ? -Number(p.amount) : Number(p.amount)), 0);

/** Llegadas y salidas del día en una sola vista. */
export default async function Page({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
  const { ctx, unit, supabase } = await lodgingContext();
  const canManage = ctx.permissions.has("lodging.reservations.manage");
  const canConfigure = ctx.permissions.has("lodging.operations.configure");
  const [{ data: arrivals }, { data: departures }, { data: housekeepingEnabled }] = await Promise.all([
    supabase
      .from("lodging_reservations")
      .select(
        "id,estimated_arrival,status,origin,room_id,total_value,lodging_rooms(name,operational_status),lodging_guests(full_name,phone),lodging_reservation_payments(amount,type,status)",
      )
      .eq("business_unit_id", unit.id)
      .eq("check_in", today)
      .neq("status", "cancelled")
      .order("estimated_arrival", { nullsFirst: false }),
    supabase
      .from("lodging_reservations")
      .select(
        "id,estimated_departure,status,total_value,lodging_rooms(name,status),lodging_guests(full_name),lodging_reservation_payments(amount,type,status)",
      )
      .eq("business_unit_id", unit.id)
      .eq("check_out", today)
      .neq("status", "cancelled")
      .order("estimated_departure", { nullsFirst: false }),
    supabase.rpc("lodging_ops_housekeeping_enabled", { target_unit: unit.id }),
  ]);
  const showRoomStatus = housekeepingEnabled !== false;
  const arrivalIds = (arrivals ?? []).map((r) => r.id);
  const [{ data: contacts }, { data: infoRow }, { data: roomCodes }, { data: unitRooms }] = await Promise.all([
    arrivalIds.length
      ? supabase.from("lodging_arrival_contacts").select("reservation_id,contacted_at").in("reservation_id", arrivalIds)
      : Promise.resolve({ data: [] as { reservation_id: string; contacted_at: string }[] }),
    supabase.from("lodging_arrival_info").select("info").eq("business_unit_id", unit.id).maybeSingle(),
    supabase.from("lodging_room_access_codes").select("room_id,code").eq("business_unit_id", unit.id),
    supabase.from("lodging_rooms").select("id,name").eq("business_unit_id", unit.id).eq("active", true).order("display_order"),
  ]);
  const codeByRoom = new Map((roomCodes ?? []).map((c) => [c.room_id, c.code]));
  const infoNeedsCode = needsRoomCode(infoRow?.info);
  const contactedAt = new Map((contacts ?? []).map((c) => [c.reservation_id, c.contacted_at]));
  const contactedCount = arrivalIds.filter((id) => contactedAt.has(id)).length;
  const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit" });

  const heading = (icon: React.ReactNode, title: string, count: number) => (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2 className="font-semibold">{title}</h2>
      <span className="ml-auto rounded-full bg-[#edf4fc] px-2.5 py-0.5 text-xs font-semibold text-[#0b4f9c]">
        {count}
      </span>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Llegadas/Salidas"
        description="Huéspedes que llegan y salen hoy: contacto, habitación, saldo, check-out y limpieza."
      />
      {(q.success || q.error) && (
        <p className={`mb-4 rounded-xl p-3 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{q.error || q.success}</p>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          {heading(<LogIn size={18} className="text-[#0b4f9c]" />, "Llegadas de hoy", arrivals?.length ?? 0)}
          {arrivalIds.length > 0 && (
            <p className="-mt-1 mb-3 text-xs text-slate-500">
              Bienvenida enviada a <b>{contactedCount}</b> de {arrivalIds.length}. Cada botón abre WhatsApp con el mensaje listo (horarios, check-in online e información del hostal).
            </p>
          )}
          <div className="space-y-3">
            {(arrivals ?? []).map((r) => {
              const g = one(r.lodging_guests),
                room = one(r.lodging_rooms);
              const sentAt = contactedAt.get(r.id);
              return (
                <div key={r.id} className="rounded-xl border p-4 text-sm">
                  <Link href={`/lodging/reservations/${r.id}`} className="grid gap-1 sm:grid-cols-[70px_1fr_auto] sm:gap-3">
                    <b>{r.estimated_arrival?.slice(0, 5) || "Sin hora"}</b>
                    <span>
                      <span className="block font-medium">{g?.full_name || "Información pendiente"}</span>
                      <span className="text-slate-500">
                        {room?.name} · {g?.phone || "Sin teléfono"}
                      </span>
                      {showRoomStatus && room?.operational_status && (
                        <span
                          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${operationalStatusTone[room.operational_status as OperationalStatus]?.chip ?? ""}`}
                        >
                          {operationalStatusTone[room.operational_status as OperationalStatus]?.icon}{" "}
                          {operationalStatusLabels[room.operational_status as OperationalStatus] ?? room.operational_status}
                        </span>
                      )}
                    </span>
                    <span className="sm:text-right">
                      Saldo {clp.format(Number(r.total_value) - paidOf(r.lodging_reservation_payments))}
                    </span>
                  </Link>
                  {canManage && (
                    <div className="mt-3 flex flex-wrap items-start justify-between gap-2 border-t pt-3">
                      <ArrivalContactButton reservationId={r.id} contacted={!!sentAt} />
                      <span className="text-right text-[11px] text-slate-500">
                        {sentAt ? <b className="text-emerald-700">✓ Bienvenida enviada a las {timeLabel(sentAt)}</b> : "Sin enviar"}
                        {infoNeedsCode && !codeByRoom.has(r.room_id) && (
                          <span className="block text-amber-700">Falta la clave de {room?.name ?? "la habitación"}: el mensaje saldrá sin ella</span>
                        )}
                        {(r.origin === "booking" || r.origin === "airbnb") && (
                          <span className="block text-amber-700">Reserva de {r.origin === "booking" ? "Booking" : "Airbnb"}: confirma que el teléfono sea del huésped</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            {!arrivals?.length && <p className="text-sm text-slate-500">No hay llegadas programadas para hoy.</p>}
          </div>
        </Panel>

        <Panel>
          {heading(<LogOut size={18} className="text-[#0b4f9c]" />, "Salidas de hoy", departures?.length ?? 0)}
          <div className="space-y-3">
            {(departures ?? []).map((r) => {
              const g = one(r.lodging_guests),
                room = one(r.lodging_rooms);
              return (
                <Link
                  key={r.id}
                  href={`/lodging/reservations/${r.id}`}
                  className="grid gap-1 rounded-xl border p-4 text-sm sm:grid-cols-[70px_1fr_auto] sm:gap-3"
                >
                  <b>{r.estimated_departure?.slice(0, 5) || "Sin hora"}</b>
                  <span>
                    <span className="block font-medium">{g?.full_name || "Información pendiente"}</span>
                    <span className="text-slate-500">
                      {room?.name} · Saldo {clp.format(Number(r.total_value) - paidOf(r.lodging_reservation_payments))}
                    </span>
                  </span>
                  <span className="capitalize sm:text-right">
                    {uiLabel(r.status)} · {uiLabel(room?.status)}
                  </span>
                </Link>
              );
            })}
            {!departures?.length && <p className="text-sm text-slate-500">No hay salidas programadas para hoy.</p>}
          </div>
        </Panel>
      </div>

      <Panel className="mt-5">
        <h2 className="font-semibold">Información de llegada de {unit.name}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Este texto se agrega al mensaje de bienvenida (por ejemplo la dirección, un enlace de ubicación, el WiFi o instrucciones para llegar). El mensaje ya incluye los horarios, el desayuno de Cobija y el link de check-in online.
        </p>
        {infoRow?.info ? (
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm">{infoRow.info}</p>
        ) : (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Aún no hay información de llegada: el mensaje saldrá solo con horarios y el link de check-in.</p>
        )}
        {canConfigure && (
          <form action={saveArrivalInfoAction} className="mt-3 space-y-2">
            <input type="hidden" name="unit_id" value={unit.id} />
            <textarea
              name="info"
              rows={5}
              maxLength={2500}
              defaultValue={infoRow?.info ?? ""}
              placeholder="Ej.: Estamos en Calle Ejemplo 123. Ubicación: https://maps.app/... Usa {habitacion} y {clave_habitacion} para la clave de ingreso de cada pieza."
              className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
            />
            <button className="rounded-xl bg-[#0b4f9c] px-4 py-2 text-sm font-semibold text-white">Guardar información</button>
          </form>
        )}
        {canConfigure && (
          <details className="mt-4 rounded-xl border border-[#d9dfe6] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-[#0b4f9c]">
              Claves de ingreso de las habitaciones ({(roomCodes ?? []).length} de {(unitRooms ?? []).length} cargadas)
            </summary>
            <p className="mt-2 text-xs text-slate-500">
              Si el texto de arriba usa <code>{"{clave_habitacion}"}</code>, el mensaje de cada huésped lleva la clave de su habitación. Si una habitación no tiene clave, esa línea se quita.
            </p>
            <form action={saveRoomCodesAction} className="mt-3 space-y-2">
              <input type="hidden" name="unit_id" value={unit.id} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(unitRooms ?? []).map((rm) => (
                  <label key={rm.id} className="block text-xs">
                    {rm.name}
                    <input name={`code_${rm.id}`} defaultValue={codeByRoom.get(rm.id) ?? ""} maxLength={40} autoComplete="off" className="mt-1 block w-full rounded-lg border bg-white px-2 py-1.5 text-sm" />
                  </label>
                ))}
              </div>
              <button className="rounded-xl bg-[#0b4f9c] px-4 py-2 text-sm font-semibold text-white">Guardar claves</button>
            </form>
          </details>
        )}
      </Panel>
    </>
  );
}
