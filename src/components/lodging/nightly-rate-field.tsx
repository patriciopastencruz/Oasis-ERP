"use client";

import { useEffect, useRef, useState } from "react";
import { rateForGuests, type RatesByGuests } from "@/modules/lodging/domain/reservations";

type RoomRate = { id: string; base_rate: number | string; rates_by_guests?: RatesByGuests };

const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

/**
 * Tarifa por noche de una reserva nueva: se sugiere según la habitación y la
 * cantidad de personas (tarifas por personas de la habitación). Si recepción
 * escribe otra tarifa, se respeta y deja de sugerirse.
 */
export function NightlyRateField({ rooms, initialRoomId, className }: { rooms: RoomRate[]; initialRoomId?: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [edited, setEdited] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const initial = rooms.find((r) => r.id === initialRoomId) ?? rooms[0];

  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const update = (event?: Event) => {
      // Lo que recepción escribe en la tarifa no dispara una nueva sugerencia.
      if (event?.target === input.current) return;
      const roomId = (form.elements.namedItem("room_id") as HTMLSelectElement | null)?.value;
      const guests = Math.max(1, Number((form.elements.namedItem("guest_count") as HTMLInputElement | null)?.value) || 1);
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return;
      const suggested = rateForGuests(room, guests);
      const perGuest = Object.keys(room.rates_by_guests ?? {}).length > 0;
      setHint(perGuest ? `Sugerida para ${guests} persona${guests === 1 ? "" : "s"}: ${clp(suggested)}` : null);
      if (!edited && input.current) input.current.value = String(suggested);
    };
    update();
    form.addEventListener("change", update);
    form.addEventListener("input", update);
    return () => {
      form.removeEventListener("change", update);
      form.removeEventListener("input", update);
    };
  }, [rooms, edited]);

  return (
    <>
      <input
        ref={input}
        name="nightly_rate"
        type="number"
        min="0"
        required
        defaultValue={initial ? rateForGuests(initial, 1) : 0}
        onInput={() => setEdited(true)}
        className={className}
      />
      {hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
    </>
  );
}
