import { describe, expect, it } from "vitest";
import { arrivalLabel, byUrgency, checklistFrom, housekeepingChecklist, minutesToArrival, statusCounts, type OpsRoom } from "./operations";

const room = (name: string, next: OpsRoom["next_arrival"], extra: Partial<OpsRoom> = {}): OpsRoom => ({
  id: name,
  name,
  room_type: "Modulares",
  display_order: 1,
  operational_status: "dirty",
  rework: false,
  status_changed_at: "",
  occupied: false,
  departure_today: false,
  task: null,
  awaiting: null,
  last_rejection: null,
  next_arrival: next,
  ...extra,
});

// 10:00 en Santiago (UTC-3 en septiembre).
const now = new Date("2026-09-26T13:00:00Z");
const today = "2026-09-26";

describe("prioridad del aseo", () => {
  it("calcula minutos al próximo check-in en hora de Santiago", () => {
    expect(minutesToArrival(room("a", { date: today, time: "14:00", guests: 2 }), now, today)).toBe(240);
    expect(minutesToArrival(room("b", { date: "2026-09-27", time: "09:00", guests: 1 }), now, today)).toBe(1380);
    expect(minutesToArrival(room("c", null), now, today)).toBeNull();
  });

  it("ordena por check-in más próximo y retrabajo primero a igual hora", () => {
    const rooms = [
      room("sin", null),
      room("tarde", { date: today, time: "17:00", guests: 1 }),
      room("temprano", { date: today, time: "14:00", guests: 1 }),
      room("retrabajo", { date: today, time: "14:00", guests: 1 }, { rework: true }),
    ].sort(byUrgency(now, today));
    expect(rooms.map((r) => r.name)).toEqual(["retrabajo", "temprano", "tarde", "sin"]);
  });

  it("etiqueta el próximo check-in en lenguaje simple", () => {
    expect(arrivalLabel(room("a", { date: today, time: "14:00", guests: 1 }), today)).toBe("Hoy 14:00");
    expect(arrivalLabel(room("a", { date: "2026-09-27", time: "15:30", guests: 1 }), today)).toBe("Mañana 15:30");
    expect(arrivalLabel(room("a", { date: "2026-10-02", time: "14:00", guests: 1 }), today)).toBe("vie 02-10 14:00");
    expect(arrivalLabel(room("a", null), today)).toBe("Sin llegadas próximas");
  });
});

describe("checklist", () => {
  it("TODO OK marca todo; si no, solo lo marcado queda ok", () => {
    const all = checklistFrom(housekeepingChecklist, new Set(), true);
    expect(Object.values(all).every(Boolean)).toBe(true);
    expect(Object.keys(all)).toHaveLength(20);
    const partial = checklistFrom(housekeepingChecklist, new Set(["cama"]), false);
    expect(partial.cama).toBe(true);
    expect(partial.bano).toBe(false);
  });

  it("cuenta habitaciones por estado", () => {
    expect(statusCounts([room("a", null), room("b", null, { operational_status: "inspected" })])).toMatchObject({ dirty: 1, inspected: 1, cleaning: 0 });
  });
});
