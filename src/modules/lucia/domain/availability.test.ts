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

  it("con baño privado pedido, quita las de baño compartido y avisa la hostal que no tiene", () => {
    const result = searchAvailability({
      ...base,
      privateBathOnly: true,
      rooms: [
        room("u1", "HU", { description: "1 cama matrimonial, baño compartido" }),
        room("c1", "HOC", { roomType: "Habitación baño compartido", description: "mini modular con baño privado" }),
        room("c2", "HOC", { roomType: "Modulares", description: "2 camas de 1 plaza" }),
        room("c3", "HOC", { description: "2 camas, baño compartido" }),
      ],
      bookings: [],
    });
    expect(result.ok && result.hostales.map((h) => [h.hostal, h.opciones.map((o) => o.codigo)])).toEqual([
      ["Hostal Oasis Centro", ["c1", "c2"]],
    ]);
    expect(formatAvailabilityForWhatsApp(result)).toContain(
      "Hostal Uruguay no tiene habitaciones con baño privado libres para esas fechas.\n\nHostal Oasis Cobija no tiene habitaciones libres para 2 personas del sábado 24 al lunes 26 de octubre.",
    );
  });

  it("no ofrece habitaciones que no admiten a todas las personas", () => {
    const result = searchAvailability({ ...base, guests: 3, rooms: [room("u1", "HU")], bookings: [] });
    expect(result.ok && result.hostales).toEqual([]);
    expect(formatAvailabilityForWhatsApp(result)).toBe(
      "😔 No tenemos habitaciones libres para 3 personas del sábado 24 al lunes 26 de octubre en ninguna de nuestras hostales.",
    );
  });

  it("ofrece una combinación disponible de tres y dos personas para un grupo de cinco", () => {
    const result = searchAvailability({
      ...base,
      guests: 5,
      rooms: [
        room("u3", "HU", {
          roomType: "Mini depto",
          description: "1 cama matrimonial y futón, baño privado",
          capacity: 3,
          ratesByGuests: { "1": 27000, "2": 32000, "3": 36000 },
        }),
        room("u2", "HU", {
          roomType: "Simple matrimonial",
          capacity: 2,
          ratesByGuests: { "1": 24000, "2": 29000 },
        }),
      ],
      bookings: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hostales[0].opciones).toEqual([]);
    expect(result.hostales[0].combinaciones[0]).toMatchObject({
      habitaciones: [
        { codigo: "u3", personas: 3, precio_noche: 36000 },
        { codigo: "u2", personas: 2, precio_noche: 29000 },
      ],
      precio_noche: 65000,
      total_estadia: 130000,
    });
    expect(formatAvailabilityForWhatsApp(result)).toContain(
      "Opción para el grupo en 2 habitaciones:\n• Mini depto: 1 cama matrimonial y futón, baño privado para 3 personas: $36.000 por noche\n• Simple matrimonial: 1 cama matrimonial, baño privado para 2 personas: $29.000 por noche\nTotal: $65.000 por noche ($130.000 por 2 noches)",
    );
  });

  it("no combina una habitación ocupada durante parte de la estadía", () => {
    const result = searchAvailability({
      ...base,
      guests: 5,
      rooms: [
        room("u3", "HU", { capacity: 3, ratesByGuests: { "3": 36000 } }),
        room("u2", "HU"),
      ],
      bookings: [{ room_id: "u3", check_in: "2026-10-25", check_out: "2026-10-26" }],
    });
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

describe("baño privado pedido", () => {
  it("informa desde cuánto parten las opciones con baño compartido que se ocultaron", () => {
    const result = searchAvailability({
      ...base,
      privateBathOnly: true,
      rooms: [
        room("u1", "HU", { description: "1 cama matrimonial, baño privado y cocina compartida" }),
        room("u2", "HU", { description: "2 camas, baño compartido y cocina compartida", ratesByGuests: { "1": 23000, "2": 29000 } }),
        room("c1", "HOC", { roomType: "Habitación baño compartido", description: "1 cama de 2 plazas", ratesByGuests: { "1": 24000, "2": 28000 } }),
        room("b1", "HOB", { roomType: "Mini depto", description: "1 cama matrimonial, TV, cocina, frigobar y baño privado" }),
      ],
      bookings: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hostales.flatMap((h) => h.opciones.map((o) => o.codigo))).toEqual(["u1", "b1"]);
    expect(result.compartidas_desde).toBe(28000);
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
        "*Hostal Uruguay (Uruguay, sector 23 de marzo)* 🏨",
        "• Habitación: 2 camas, baño compartido: $28.000 por noche ($56.000 por 2 noches)",
        "• Habitación: 1 cama matrimonial, baño privado: $30.000 por noche ($60.000 por 2 noches)",
        "",
        "Hostal Oasis Centro y Hostal Oasis Cobija no tienen habitaciones libres para 2 personas del sábado 24 al lunes 26 de octubre.",
      ].join("\n"),
    );
  });

  it("con una noche no repite el total y no duplica el tipo de habitación en la descripción", () => {
    const result = searchAvailability({
      ...base,
      checkOut: "2026-10-25",
      rooms: [room("b1", "HOB", { roomType: "Mini depto", description: "MINI DEPTOS 1C MATRIMONIAL + FUTÓN, TV Y BAÑO PRIVADO" })],
      bookings: [],
    });
    expect(formatAvailabilityForWhatsApp(result).split("\n")[1]).toMatch(/^• Mini depto: 1/);
    expect(formatAvailabilityForWhatsApp(result)).not.toMatch(/por 1 noche/);
  });
});
