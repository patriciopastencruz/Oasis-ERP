import { describe, expect, it } from "vitest";
import { incidentAlerts, incidentCategories, isBlocking, type IncidentItem } from "./incidents";

const item = (over: Partial<IncidentItem>): IncidentItem => ({
  id: "i",
  status: "open",
  priority: "medium",
  category: "tv",
  description: "No enciende",
  source: "reception",
  created_at: "2026-09-27T12:00:00Z",
  room_id: "r",
  room_name: "Hab 3",
  blocks_room: null,
  room_blocked_at: null,
  room_released_at: null,
  reported_by: "Carla",
  assigned_to: null,
  photos: 0,
  upcoming_arrival: null,
  ...over,
});

describe("incidencias", () => {
  it("usa las mismas categorías de las auditorías", () => {
    expect(incidentCategories).toHaveLength(12);
    expect(incidentCategories.find(([k]) => k === "agua_caliente")?.[1]).toBe("Agua caliente");
  });

  it("solo bloquea mientras no se libera la habitación", () => {
    expect(isBlocking(item({ blocks_room: "maintenance" }))).toBe(true);
    expect(isBlocking(item({ blocks_room: "maintenance", room_released_at: "2026-09-27T13:00:00Z" }))).toBe(false);
    expect(isBlocking(item({}))).toBe(false);
  });

  it("alerta habitación bloqueada con llegada próxima antes que una crítica sin asignar", () => {
    const alerts = incidentAlerts(
      [
        item({ id: "a", priority: "critical", category: "electricidad", room_name: "Hab 1" }),
        item({ id: "b", blocks_room: "out_of_service", upcoming_arrival: { date: "2026-09-27", guests: 2 } }),
        item({ id: "c", blocks_room: "maintenance", upcoming_arrival: { date: "2026-09-29", guests: 1 }, status: "in_progress" }),
        item({ id: "d", priority: "critical", status: "assigned" }),
        item({ id: "e", status: "resolved", blocks_room: "maintenance", upcoming_arrival: { date: "2026-09-27", guests: 1 } }),
      ],
      "2026-09-27",
    );
    expect(alerts.map((a) => a.id)).toEqual(["b", "c", "a"]);
    expect(alerts[0].text).toBe("Hab 3 está fuera de servicio y tiene llegada hoy");
    expect(alerts[1].text).toContain("llegada el 29/09");
    expect(alerts[2].text).toBe("Incidencia crítica sin asignar en Hab 1: Electricidad");
  });
});
