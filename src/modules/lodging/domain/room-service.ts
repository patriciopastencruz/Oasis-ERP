/**
 * Períodos en que una habitación estuvo fuera de servicio (o en mantención). Solo en esos días deja de contar
 * como habitación disponible; el resto del tiempo, y mientras tenga noches vendidas, cuenta como cualquier otra.
 */

const OUT_OF_SERVICE = new Set(["out_of_service", "maintenance"]);
export const isOutOfServiceStatus = (status: string | null | undefined) => OUT_OF_SERVICE.has(status ?? "");

/** `from` es el día en que salió de servicio (incluido) y `to` el día en que volvió (excluido); null si sigue fuera. */
export type ServiceGap = { from: string; to: string | null };
export type RoomStatusEvent = { room_id: string; from_status: string | null; to_status: string; created_at: string };

const santiagoDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(iso));

/**
 * Arma los períodos fuera de servicio de cada habitación a partir del historial de cambios de estado.
 * Si una habitación hoy está fuera de servicio y el historial no lo registra, se toma desde su última modificación.
 */
export function serviceGaps(
  rooms: { id: string; status?: string | null; updated_at?: string | null }[],
  events: RoomStatusEvent[],
): Record<string, ServiceGap[]> {
  const out: Record<string, ServiceGap[]> = {};
  const byRoom = new Map<string, RoomStatusEvent[]>();
  for (const e of events) byRoom.set(e.room_id, [...(byRoom.get(e.room_id) ?? []), e]);

  for (const room of rooms) {
    const list = (byRoom.get(room.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const gaps: ServiceGap[] = [];
    // Si el primer cambio registrado sale de "fuera de servicio", ya lo estaba desde antes.
    let open: string | null = list.length && isOutOfServiceStatus(list[0].from_status) ? "0000-01-01" : null;
    for (const e of list) {
      const day = santiagoDate(e.created_at);
      if (isOutOfServiceStatus(e.to_status)) {
        if (open === null) open = day;
      } else if (open !== null && isOutOfServiceStatus(e.from_status)) {
        gaps.push({ from: open, to: day });
        open = null;
      }
    }
    if (isOutOfServiceStatus(room.status)) {
      if (open === null) open = room.updated_at ? santiagoDate(room.updated_at) : "0000-01-01";
      gaps.push({ from: open, to: null });
    }
    if (gaps.length) out[room.id] = gaps;
  }
  return out;
}

/** ¿La habitación estaba fuera de servicio ese día (noche que empieza ese día)? */
export function isOutOfServiceOn(gaps: ServiceGap[] | undefined, day: string) {
  return !!gaps?.some((g) => day >= g.from && (g.to === null || day < g.to));
}
