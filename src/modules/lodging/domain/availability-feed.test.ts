import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAvailabilityFeed, compressRuns, describeRuns, freeRoomsPerNight, type FeedRoom } from "./availability-feed";

const room = (id: string, unitCode: string, roomType: string, capacity: number, baseRate: number): FeedRoom => ({ id, unitCode, name: id, roomType, capacity, baseRate });

describe("calendario de disponibilidad para asistentes", () => {
  it("una noche queda ocupada desde la entrada hasta la víspera de la salida", () => {
    const nights = freeRoomsPerNight(["a", "b"], [{ room_id: "a", check_in: "2026-11-02", check_out: "2026-11-04" }], "2026-11-01", 5);
    expect(nights.map((n) => n.free)).toEqual([2, 1, 1, 2, 2]); // el 04 (día de salida) vuelve a estar libre
  });

  it("las reservas anteriores al período solo cuentan desde el primer día", () => {
    const nights = freeRoomsPerNight(["a"], [{ room_id: "a", check_in: "2026-10-28", check_out: "2026-11-02" }], "2026-11-01", 3);
    expect(nights.map((n) => n.free)).toEqual([0, 1, 1]);
  });

  it("une noches con la misma cantidad libre en tramos", () => {
    const runs = compressRuns([
      { date: "2026-11-01", free: 2 },
      { date: "2026-11-02", free: 1 },
      { date: "2026-11-03", free: 1 },
      { date: "2026-11-04", free: 2 },
    ]);
    expect(runs).toEqual([
      { from: "2026-11-01", to: "2026-11-02", free: 2 },
      { from: "2026-11-02", to: "2026-11-04", free: 1 },
      { from: "2026-11-04", to: "2026-11-05", free: 2 },
    ]);
    expect(describeRuns(runs)).toContain("noches del 02-11-2026 al 03-11-2026: 1 libre");
  });

  it("agrupa las habitaciones por hostal, tipo, capacidad y tarifa, sin datos de huéspedes", () => {
    const feed = buildAvailabilityFeed({
      rooms: [
        room("m1", "HOC", "Modulares", 2, 28000),
        room("m2", "HOC", "Modulares", 2, 28000),
        room("c1", "HOB", "Mini depto", 3, 27000),
        room("p6", "HU", "Habitación", 1, 20000),
      ],
      bookings: [{ room_id: "m1", check_in: "2026-11-02", check_out: "2026-11-03" }],
      today: "2026-11-01",
      days: 4,
      updatedAt: "01-11-2026 10:00",
    });
    expect(feed).toHaveLength(3);
    const centro = feed.find((f) => f.category.includes("Centro"))!;
    expect(centro.total_rooms).toBe(2);
    expect(centro.brand).toBe("Hostal Oasis Modulares (Centro)");
    expect(centro.description).toContain("sin desayuno");
    expect(centro.description).toContain("Check-in desde las 14:00 y check-out a las 12:00");
    expect(centro.free_runs.find((r) => r.from === "2026-11-02")!.free).toBe(1);
    const cobija = feed.find((f) => f.category.includes("Cobija"))!;
    expect(cobija.description).toContain("con desayuno incluido");
    expect(feed.find((f) => f.category.includes("Uruguay"))!.link).toContain("reservar/hostal-uruguay");
    expect(JSON.stringify(feed)).not.toMatch(/guest|huésped_|phone|email/i);
  });
});

describe("migración de la clave del calendario", () => {
  const sql = readFileSync("supabase/migrations/20261019140000_lodging_public_feed_keys.sql", "utf8");
  it("guarda solo el hash de la clave y no da acceso a personas usuarias", () => {
    expect(sql).toContain("alter table public.lodging_public_feed_keys enable row level security");
    expect(sql).toContain("revoke all on public.lodging_public_feed_keys from public,anon,authenticated");
    expect(sql).toContain("key_hash text not null unique check(key_hash ~ '^[0-9a-f]{64}$')");
    expect(sql).not.toMatch(/create policy/);
    expect(sql).not.toMatch(/grant [^;]*authenticated;/);
  });
});
