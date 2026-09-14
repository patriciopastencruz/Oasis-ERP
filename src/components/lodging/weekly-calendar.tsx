"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { reassignReservationRoomAction } from "@/modules/lodging/application/actions";

type Room = { id: string; name: string; status: string; capacity?: number };
type Reservation = {
  id: string;
  room_id: string;
  origin: string;
  status: string;
  check_in: string;
  check_out: string;
  information_complete: boolean;
  relation_type?: string | null;
  lodging_guests: { full_name: string } | { full_name: string }[] | null;
};

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

export function WeeklyCalendar({
  rooms,
  reservations,
  initialMonday,
  canManage = false,
}: {
  rooms: Room[];
  reservations: Reservation[];
  initialMonday: string;
  canManage?: boolean;
}) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [origin, setOrigin] = useState("all");
  const [room, setRoom] = useState("all");
  const [localReservations, setLocalReservations] = useState(reservations);
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
    const start = add(new Date(`${initialMonday}T12:00:00Z`), offset * 7);
    return Array.from({ length: 7 }, (_, index) => add(start, index));
  }, [initialMonday, offset]);
  const weekStart = iso(days[0]);
  const weekEnd = iso(add(days[0], 7));
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
            className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            onClick={() => setOffset((value) => value + 1)}
            aria-label="Semana siguiente"
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
        <div className="grid min-w-[900px] grid-cols-[155px_repeat(7,minmax(105px,1fr))]">
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-[11px] font-semibold text-slate-500">
            Habitación
          </div>
          {days.map((day) => (
            <div
              key={iso(day)}
              className="border-b border-l border-slate-100 bg-slate-50/60 px-2 py-2.5 text-center"
            >
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
            return (
              <div key={currentRoom.id} className="contents">
                <div className="border-b border-slate-100 px-4 py-3">
                  <b className="block text-sm font-semibold text-slate-800">
                    {currentRoom.name}
                  </b>
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    {roomStatusLabels[currentRoom.status] ??
                      "Estado desconocido"}
                    {currentRoom.capacity
                      ? ` · ${currentRoom.capacity} personas`
                      : ""}
                  </span>
                </div>
                <div
                  className={`col-span-7 grid grid-cols-7 ${
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
                      className="row-start-1 min-h-16 border-b border-l border-slate-100"
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
                      7,
                      dayDifference(reservation.check_out, weekStart),
                    );
                    const draggable =
                      canManage &&
                      reservation.status !== "cancelled" &&
                      reservation.status !== "checked_out";
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
                        style={{ gridColumn: `${start + 1} / ${end + 1}` }}
                        className={`relative row-start-1 z-10 m-1.5 flex min-w-0 cursor-pointer self-center rounded-md border px-3 py-2 text-[11px] transition hover:brightness-[.98] hover:shadow-sm ${
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
                        <span
                          title={
                            reservation.information_complete
                              ? "Nombre y precio cargados"
                              : "Falta cargar nombre y precio"
                          }
                          className={`absolute right-1 bottom-1 size-1.5 shrink-0 rounded-full ring-1 ring-white ${
                            reservation.information_complete
                              ? "bg-emerald-500"
                              : "bg-red-500"
                          }`}
                        />
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
