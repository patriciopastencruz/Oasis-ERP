"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { es } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { getRoomBookedRangesAction } from "@/modules/lodging/application/public-actions";

// No se importa clp desde application/queries.ts: ese módulo depende de
// next/headers (solo servidor) y rompería el bundle de este componente
// cliente. Se define el mismo formateador localmente.
const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

type Room = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  base_rate: number | string;
};

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
function parseISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const field =
  "mt-1 block w-full rounded-xl border border-[#e4d9c8] bg-white px-3.5 py-2.5 text-sm text-[#241c16] outline-none focus:border-[#c1652f]";
const label = "text-sm font-medium text-[#3a2f26]";

export function RoomAvailabilityPicker({ rooms }: { rooms: Room[] }) {
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [range, setRange] = useState<DateRange | undefined>();
  const [bookedRanges, setBookedRanges] = useState<DateRange[]>([]);
  const [guestCount, setGuestCount] = useState(1);
  const [isPending, startTransition] = useTransition();

  function loadAvailability(id: string) {
    startTransition(async () => {
      const booked = await getRoomBookedRangesAction(id);
      // check_out es la fecha de salida (la pieza vuelve a estar libre ese
      // día); se deshabilita hasta la noche anterior, no el día de salida.
      setBookedRanges(
        booked.map((b) => ({
          from: parseISODate(b.check_in),
          to: addDays(parseISODate(b.check_out), -1),
        })),
      );
    });
  }

  // Solo al montar: trae la disponibilidad de la habitación preseleccionada
  // por defecto. Cambios posteriores de habitación los maneja el onChange
  // del selector, no un efecto (evita setState síncrono dentro de un efecto).
  useEffect(() => {
    if (roomId) loadAvailability(roomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRoomChange(newRoomId: string) {
    setRoomId(newRoomId);
    setRange(undefined);
    loadAvailability(newRoomId);
  }

  const selectedRoom = rooms.find((r) => r.id === roomId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nights =
    range?.from && range?.to
      ? Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000)
      : 0;
  const total = selectedRoom ? nights * Number(selectedRoom.base_rate) : 0;

  return (
    <div>
      <label className={label}>
        Habitación
        <select
          value={roomId}
          onChange={(e) => handleRoomChange(e.target.value)}
          required
          className={field}
        >
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {clp.format(Number(r.base_rate))} / noche ·{" "}
              {r.capacity} {r.capacity === 1 ? "persona" : "personas"}
            </option>
          ))}
        </select>
      </label>

      <div
        className="mt-4 flex justify-center rounded-xl border border-[#e4d9c8] bg-white p-3"
        style={
          {
            "--rdp-accent-color": "#c1652f",
            "--rdp-accent-background-color": "#f7e9df",
          } as CSSProperties
        }
      >
        {isPending ? (
          <p className="p-6 text-center text-sm text-[#6b5d4f]">
            Cargando disponibilidad…
          </p>
        ) : (
          <DayPicker
            mode="range"
            numberOfMonths={1}
            locale={es}
            selected={range}
            onSelect={setRange}
            disabled={[{ before: today }, ...bookedRanges]}
            excludeDisabled
            startMonth={today}
            endMonth={addDays(today, 300)}
          />
        )}
      </div>
      <p className="mt-2 text-xs text-[#6b5d4f]">
        Las fechas en gris ya están reservadas para esta habitación. Elige tu
        entrada y salida en el calendario.
      </p>

      {range?.from && range?.to && (
        <p className="mt-3 rounded-lg bg-[#faf6ef] p-3 text-sm text-[#3a2f26]">
          {nights} {nights === 1 ? "noche" : "noches"} · Total estimado:{" "}
          <b>{clp.format(total)}</b>
        </p>
      )}

      <label className={`${label} mt-4 block max-w-40`}>
        Personas
        <input
          type="number"
          min={1}
          max={selectedRoom?.capacity ?? 20}
          value={guestCount}
          onChange={(e) => setGuestCount(Number(e.target.value) || 1)}
          required
          className={field}
        />
      </label>

      <input type="hidden" name="room_id" value={roomId} />
      <input
        type="hidden"
        name="check_in"
        value={range?.from ? toISODate(range.from) : ""}
      />
      <input
        type="hidden"
        name="check_out"
        value={range?.to ? toISODate(range.to) : ""}
      />
      <input type="hidden" name="guest_count" value={guestCount} />
    </div>
  );
}
