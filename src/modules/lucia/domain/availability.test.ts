import { describe, expect, it } from "vitest";
import { formatAvailabilityForWhatsApp, searchAvailability, type AvailabilityRoom } from "./availability";

const hostels = [
  { code: "HU", name: "Hostal Uruguay" },
  { code: "HOC", name: "Hostal Oasis Centro" },
  { code: "HOB", name: "Hostal Oasis Cobija" },
];
const room = (id: string, hostelCode: string, extra: Partial<AvailabilityRoom> = {}): AvailabilityRoom => ({
  id,
  hostelCode,
  roomType: "Habitación",
  description: "1 cama matrimonial, baño privado",
  capacity: 2,
  baseRate: 25000,
  ratesByGuests: { "1": 25000, "2": 30000 },
  ...extra,
});
const base = { hostels, today: "2026-10-21", checkIn: "2026-10-24", checkOut: "2026-10-26", guests: 2 };

describe("searchAvailability", () => {
  it("agrupa por hostal, calcula precio por personas y total, y omite hostales sin lugar", () => {
    const result = searchAvailability({
      ...base,
      rooms: [room("u1", "HU"), room("u2", "HU"), room("c1", "HOC", { roomType: "Modular", ratesByGuests: { "1": 27000, "2": 32000 } }), room("b1", "HOB")],
      // Cobija ocupada una de las dos noches.
      bookings: [{ room_id: "b1", check_in: "2026-10-25", check_out: "2026-10-27" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.noches).toBe(2);
    expect(result.hostales.map((h) => h.hostal)).toEqual(["Hostal Uruguay", "Hostal Oasis Centro"]);
    expect(result.hostales[0].opciones).toEqual([
      { codigo: "u1", habitacion: "Habitación: 1 cama matrimonial, baño privado", capacidad: 2, libres: 2, precio_noche: 30000, total_estadia: 60000 },
    ]);
    expect(result.hostales[1].opciones[0].total_estadia).toBe(64000);
    expect(result.sin_disponibilidad).toEqual(["Hostal Oasis Cobija"]);
  });

  it("une opciones con la misma descripción y el mismo precio para esas personas", () => {
    const result = searchAvailability({
      ...base,
      rooms: [room("a", "HU", { ratesByGuests: { "1": 28000, "2": 30000 } }), room("b", "HU", { capacity: 3, ratesByGuests: { "1": 25000, "2": 30000, "3": 36000 } })],
      bookings: [],
    });
    expect(result.ok && result.hostales[0].opciones).toHaveLength(1);
    expect(result.ok && result.hostales[0].opciones[0].libres).toBe(2);
  });

  it("no ofrece habitaciones que no admiten a todas las personas", () => {
    const result = searchAvailability({ ...base, guests: 3, rooms: [room("u1", "HU")], bookings: [] });
    expect(result.ok && result.hostales).toEqual([]);
  });

  it("una reserva que termina el día de llegada no bloquea", () => {
    const result = searchAvailability({
      ...base,
      rooms: [room("u1", "HU")],
      bookings: [{ room_id: "u1", check_in: "2026-10-22", check_out: "2026-10-24" }],
    });
    expect(result.ok && result.hostales[0].opciones[0].libres).toBe(1);
  });

  it("rechaza fechas pasadas, invertidas o estadías muy largas", () => {
    expect(searchAvailability({ ...base, checkIn: "2026-10-20", rooms: [], bookings: [] }).ok).toBe(false);
    expect(searchAvailability({ ...base, checkOut: "2026-10-24", rooms: [], bookings: [] }).ok).toBe(false);
    expect(searchAvailability({ ...base, checkOut: "2026-12-30", rooms: [], bookings: [] }).ok).toBe(false);
  });
});

describe("formatAvailabilityForWhatsApp", () => {
  it("lista todas las opciones por hostal, una por línea, y avisa las completas", () => {
    const result = searchAvailability({
      ...base,
      rooms: [
        room("u1", "HU"),
        room("u2", "HU", { description: "2 camas, baño compartido", ratesByGuests: { "1": 22000, "2": 28000 } }),
      ],
      bookings: [],
    });
    expect(formatAvailabilityForWhatsApp(result)).toBe(
      [
        "*Hostal Uruguay* 🏨",
        "• Habitación: 2 camas, baño compartido: $28.000 por noche ($56.000 por 2 noches)",
        "• Habitación: 1 cama matrimonial, baño privado: $30.000 por noche ($60.000 por 2 noches)",
        "",
        "Hostal Oasis Centro y Hostal Oasis Cobija están completos para esas fechas.",
      ].join("\n"),
    );
  });
});
