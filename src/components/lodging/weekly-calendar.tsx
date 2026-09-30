"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Banknote, ChevronLeft, ChevronRight, LogIn, User, Users, X } from "lucide-react";
import { reassignReservationRoomAction } from "@/modules/lodging/application/actions";
import { operationalStatusColors } from "@/modules/lodging/domain/operations";

type Room = { id: string; name: string; status: string; capacity?: number; operational_status?: string };
type Reservation = {
  id: string;
  room_id: string;
  origin: string;
  status: string;
  check_in: string;
  check_out: string;
  total_value: number | string;
  guest_count: number;
  relation_type?: string | null;
  lodging_guests: { full_name: string } | { full_name: string }[] | null;
  lodging_reservation_payments?:
    | { status: string; lodging_payment_receipts: { id: string; deleted_at: string | null }[] | { id: string; deleted_at: string | null } | null }[]
    | null;
};

// Un pago puede tener comprobantes eliminados (subidos por error): solo
// cuenta si queda al menos uno activo en algún pago confirmado.
function hasPaidReceipt(reservation: Pick<Reservation, "lodging_reservation_payments">) {
  return (reservation.lodging_reservation_payments ?? []).some((payment) => {
    if (payment.status !== "confirmed") return false;
    const receipts = Array.isArray(payment.lodging_payment_receipts)
      ? payment.lodging_payment_receipts
      : payment.lodging_payment_receipts
        ? [payment.lodging_payment_receipts]
        : [];
    return receipts.some((r) => !r.deleted_at);
  });
}

// "information_complete" en la base solo se pone en false al importar por
// iCal (queda en true por defecto para el resto), así que una reserva
// directa creada sin precio igual aparecía marcada como completa. El punto
// del calendario se calcula en cambio a partir de los datos reales que se
// ven al abrir la reserva: nombre real (no el placeholder que deja el
// import) y precio mayor a cero.
function hasCompleteInfo(
  reservation: Pick<Reservation, "total_value">,
  guestName: string | undefined,
) {
  const hasPrice = Number(reservation.total_value) > 0;
  const hasName = !!guestName && !guestName.includes("información pendiente");
  return hasPrice && hasName;
}

const originStyles: Record<string, string> = {
  booking: "border-blue-200 bg-blue-50 text-blue-800",
  airbnb: "border-rose-200 bg-rose-50 text-rose-800",
  direct: "border-emerald-200 bg-emerald-50 text-emerald-800",
  company: "border-amber-200 bg-amber-50 text-amber-800",
  whatsapp: "border-teal-200 bg-teal-50 text-teal-800",
  maintenance: "border-slate-300 bg-slate-100 text-slate-700",
  other: "border-violet-200 bg-violet-50 text-violet-800",
};
const originLabels: Record<string, string> = {
  booking: "Booking",
  airbnb: "Airbnb",
  direct: "Directa",
  company: "Empresa",
  whatsapp: "WhatsApp",
  maintenance: "Mantención",
  other: "Otro",
};
const roomStatusLabels: Record<string, string> = {
  available: "Disponible",
  occupied: "Ocupada",
  cleaning: "Limpieza",
  maintenance: "Mantención",
  out_of_service: "Fuera de servicio",
};
const legend = ["booking", "airbnb", "direct", "company", "maintenance"];

// Estado operacional de la habitación (portal /ops): línea de color en el
// borde derecho de la celda de la habitación, con el texto debajo del nombre
// para no depender solo del color.
const roomStates: { key: string; label: string; color: string }[] = [
  { key: "dirty", label: "Sucia", color: operationalStatusColors.dirty },
  { key: "cleaning", label: "Limpiando", color: operationalStatusColors.cleaning },
  { key: "pending_inspection", label: "Por inspeccionar", color: operationalStatusColors.pending_inspection },
  { key: "inspected", label: "Limpia", color: operationalStatusColors.inspected },
  { key: "maintenance", label: "Mantención", color: operationalStatusColors.maintenance },
  { key: "out_of_service", label: "Fuera de servicio", color: operationalStatusColors.out_of_service },
];
const roomState = (status?: string) => roomStates.find((s) => s.key === status);

// Días visibles: diez, desde el día anterior (así se ven las salidas de hoy).
const VISIBLE_DAYS = 10;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const add = (date: Date, amount: number) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
};
const dayDifference = (date: string, start: string) =>
  Math.round(
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) /
      86_400_000,
  );

// Una habitación puede tener dos reservas activas en las mismas fechas (una
// manual y una importada por iCal). Cada una va en su propio "carril" para
// que ninguna tape a la otra: la primera libre en orden de llegada.
function assignLanes<T extends { id: string; check_in: string; check_out: string }>(
  items: T[],
) {
  const laneEnds: string[] = [];
  const laneOf = new Map<string, number>();
  for (const item of [...items].sort((a, b) =>
    a.check_in === b.check_in
      ? a.check_out.localeCompare(b.check_out)
      : a.check_in.localeCompare(b.check_in),
  )) {
    let lane = laneEnds.findIndex((end) => end <= item.check_in);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.check_out);
    } else laneEnds[lane] = item.check_out;
    laneOf.set(item.id, lane);
  }
  return { laneOf, laneCount: Math.max(1, laneEnds.length) };
}

export function WeeklyCalendar({
  rooms,
  reservations,
  initialStart,
  canManage = false,
  showRoomStatus = true,
}: {
  rooms: Room[];
  reservations: Reservation[];
  initialStart: string;
  canManage?: boolean;
  /** Oculta el estado de limpieza cuando el hostal no usa el circuito de aseo. */
  showRoomStatus?: boolean;
}) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [origin, setOrigin] = useState("all");
  const [room, setRoom] = useState("all");
  const [localReservations, setLocalReservations] = useState(reservations);
  // Cuando el servidor envía datos nuevos (pago o comprobante recién cargado,
  // cambio de fechas), la copia local se reemplaza; si no, el calendario
  // seguiría mostrando la versión anterior hasta recargar la página.
  const [receivedReservations, setReceivedReservations] = useState(reservations);
  if (reservations !== receivedReservations) {
    setReceivedReservations(reservations);
    setLocalReservations(reservations);
  }
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDrop(reservationId: string, targetRoomId: string) {
    setDraggingId(null);
    const reservation = localReservations.find((r) => r.id === reservationId);
    if (!reservation || reservation.room_id === targetRoomId) return;
    const previousRoomId = reservation.room_id;
    setLocalReservations((prev) =>
      prev.map((r) =>
        r.id === reservationId ? { ...r, room_id: targetRoomId } : r,
      ),
    );
    setDropError(null);
    startTransition(async () => {
      const result = await reassignReservationRoomAction(
        reservationId,
        targetRoomId,
      );
      if (!result.ok) {
        setLocalReservations((prev) =>
          prev.map((r) =>
            r.id === reservationId ? { ...r, room_id: previousRoomId } : r,
          ),
        );
        setDropError(result.message);
      }
    });
  }
  const days = useMemo(() => {
    const start = add(new Date(`${initialStart}T12:00:00Z`), offset * 7 - 1);
    return Array.from({ length: VISIBLE_DAYS }, (_, index) => add(start, index));
  }, [initialStart, offset]);
  const weekStart = iso(days[0]);
  const weekEnd = iso(add(days[0], VISIBLE_DAYS));
  const visibleRooms = rooms.filter(
    (item) => room === "all" || item.id === room,
  );

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,.035)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset((value) => value - 1)}
            aria-label="Semana anterior"
            title="Retroceder una semana"
            className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            onClick={() => setOffset((value) => value + 1)}
            aria-label="Semana siguiente"
            title="Avanzar una semana"
            className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
          >
            <ChevronRight size={17} />
          </button>
          <button
            onClick={() => setOffset(0)}
            className="ml-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Hoy
          </button>
        </div>

        <div className="ml-auto hidden flex-wrap items-center gap-4 xl:flex">
          {legend.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-600"
            >
              <span
                className={`size-2 rounded-full ${originStyles[item].split(" ")[1]}`}
              />
              {originLabels[item]}
            </span>
          ))}
        </div>

        <select
          aria-label="Filtrar por habitación"
          value={room}
          onChange={(event) => setRoom(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-[#0b4f9c]"
        >
          <option value="all">Todas las habitaciones</option>
          {rooms.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por origen"
          value={origin}
          onChange={(event) => setOrigin(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-[#0b4f9c]"
        >
          <option value="all">Todos los orígenes</option>
          {Object.entries(originLabels).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </div>

      {showRoomStatus && (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-3 py-2" aria-label="Estado de las habitaciones">
        <span className="text-[11px] font-semibold text-slate-500">Estado de la habitación:</span>
        {roomStates.map((state) => (
          <span key={state.key} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
            <span className="h-3 w-1 rounded-full" style={{ background: state.color }} />
            {state.label}
          </span>
        ))}
      </div>
      )}

      {dropError && (
        <div className="flex items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          {dropError}
          <button
            onClick={() => setDropError(null)}
            aria-label="Cerrar"
            className="shrink-0 rounded p-0.5 hover:bg-red-100"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="grid min-w-[980px] grid-cols-[140px_repeat(10,minmax(78px,1fr))]">
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-[11px] font-semibold text-slate-500">
            Habitación
          </div>
          {days.map((day) => (
            <div
              key={iso(day)}
              className={`border-b border-l border-slate-100 px-1 py-2 text-center ${
                iso(day) === initialStart ? "bg-[#edf4fc]" : "bg-slate-50/60"
              }`}
            >
              {iso(day) === initialStart && (
                <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-[#0b4f9c]">
                  Hoy
                </span>
              )}
              {dayDifference(iso(day), initialStart) === -1 && (
                <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Ayer
                </span>
              )}
              <b className="block text-xs font-semibold capitalize text-slate-700">
                {new Intl.DateTimeFormat("es-CL", {
                  weekday: "short",
                  day: "2-digit",
                  timeZone: "UTC",
                }).format(day)}
              </b>
              <span className="text-[10px] capitalize text-slate-400">
                {new Intl.DateTimeFormat("es-CL", {
                  month: "long",
                  timeZone: "UTC",
                }).format(day)}
              </span>
            </div>
          ))}

          {visibleRooms.map((currentRoom) => {
            const roomReservations = localReservations.filter(
              (reservation) =>
                reservation.room_id === currentRoom.id &&
                reservation.check_in < weekEnd &&
                reservation.check_out > weekStart &&
                (origin === "all" || reservation.origin === origin),
            );
            const { laneOf, laneCount } = assignLanes(roomReservations);
            return (
              <div key={currentRoom.id} className="contents">
                <div
                  className="border-b border-r-4 border-b-slate-100 px-3 py-2.5"
                  style={{ borderRightColor: showRoomStatus ? (roomState(currentRoom.operational_status)?.color ?? "#e2e8f0") : "#f1f5f9" }}
                >
                  <b className="block text-sm font-semibold text-slate-800">
                    {currentRoom.name}
                  </b>
                  <span className="mt-0.5 block text-[10px] text-slate-500">
                    {(showRoomStatus ? roomState(currentRoom.operational_status)?.label : undefined) ??
                      roomStatusLabels[currentRoom.status] ??
                      "Estado desconocido"}
                    {currentRoom.capacity
                      ? ` · ${currentRoom.capacity} pers.`
                      : ""}
                  </span>
                  {laneCount > 1 && (
                    <span className="mt-0.5 block text-[10px] font-medium text-amber-600">
                      Reservas solapadas
                    </span>
                  )}
                </div>
                <div
                  className={`col-span-10 grid grid-cols-10 ${
                    draggingId ? "bg-[#0b4f9c]/[.03]" : ""
                  }`}
                  onDragOver={(event) => {
                    if (draggingId) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggingId) handleDrop(draggingId, currentRoom.id);
                  }}
                >
                  {days.map((day) => (
                    <div
                      key={`${currentRoom.id}-${iso(day)}`}
                      style={{ gridRow: `1 / span ${laneCount}` }}
                      className="min-h-16 border-b border-l border-slate-100"
                    />
                  ))}
                  {roomReservations.map((reservation) => {
                    const guest = Array.isArray(reservation.lodging_guests)
                      ? reservation.lodging_guests[0]
                      : reservation.lodging_guests;
                    const start = Math.max(
                      0,
                      dayDifference(reservation.check_in, weekStart),
                    );
                    const end = Math.min(
                      VISIBLE_DAYS,
                      dayDifference(reservation.check_out, weekStart),
                    );
                    const draggable =
                      canManage &&
                      reservation.status !== "cancelled" &&
                      reservation.status !== "checked_out";
                    const complete = hasCompleteInfo(
                      reservation,
                      guest?.full_name,
                    );
                    return (
                      <div
                        key={reservation.id}
                        role="link"
                        tabIndex={0}
                        draggable={draggable}
                        onDragStart={(event) => {
                          setDraggingId(reservation.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() =>
                          router.push(`/lodging/reservations/${reservation.id}`)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter")
                            router.push(
                              `/lodging/reservations/${reservation.id}`,
                            );
                        }}
                        title={
                          draggable
                            ? `${reservation.check_in} → ${reservation.check_out} — arrastra para cambiar de habitación`
                            : `${reservation.check_in} → ${reservation.check_out}`
                        }
                        style={{
                          gridColumn: `${start + 1} / ${end + 1}`,
                          gridRow: (laneOf.get(reservation.id) ?? 0) + 1,
                        }}
                        className={`relative z-10 m-1 flex min-w-0 cursor-pointer self-center rounded-md border px-2 py-1.5 text-[11px] transition hover:brightness-[.98] hover:shadow-sm ${
                          draggable ? "cursor-grab active:cursor-grabbing" : ""
                        } ${draggingId === reservation.id ? "opacity-40" : ""} ${
                          reservation.status === "conflict"
                            ? "border-red-300 bg-red-50 text-red-800"
                            : (originStyles[reservation.origin] ??
                              originStyles.other)
                        }`}
                      >
                        <span className="min-w-0">
                          <b className="block truncate font-semibold">
                            {guest?.full_name ||
                              `Reserva ${originLabels[reservation.origin] ?? "externa"}`}
                          </b>
                          <span className="block truncate text-[10px] opacity-75">
                            {reservation.relation_type === "extension"
                              ? "Extensión directa"
                              : (originLabels[reservation.origin] ?? "Otro")}
                          </span>
                        </span>
                        <span className="absolute top-1 right-1 flex items-center gap-0.5 opacity-70">
                          <span
                            title={`${reservation.guest_count} ${reservation.guest_count === 1 ? "persona" : "personas"}`}
                          >
                            {reservation.guest_count > 1 ? (
                              <Users size={10} />
                            ) : (
                              <User size={10} />
                            )}
                          </span>
                          {reservation.status === "checked_in" && (
                            <span title="Ya está en el lugar">
                              <LogIn size={10} />
                            </span>
                          )}
                        </span>
                        <span className="absolute right-1 bottom-1 flex items-center gap-0.5">
                          {hasPaidReceipt(reservation) && (
                            <span title="Pago con comprobante cargado">
                              <Banknote size={10} className="text-emerald-600" />
                            </span>
                          )}
                          <span
                            title={
                              complete
                                ? "Nombre y precio cargados"
                                : "Falta cargar nombre y/o precio"
                            }
                            className={`size-1.5 shrink-0 rounded-full ring-1 ring-white ${
                              complete ? "bg-emerald-500" : "bg-red-500"
                            }`}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
