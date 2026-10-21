import { describe, expect, it } from "vitest";
import { buildChatTurns, type LuciaHistoryMessage } from "./history";
import { luciaOutputSchema } from "./output-schema";
import { usageCostUsd } from "./pricing";
import { buildKnowledgeBlock } from "./prompt";

const msg = (
  direction: "inbound" | "outbound",
  content: string,
  extra: Partial<LuciaHistoryMessage> = {},
): LuciaHistoryMessage => ({
  direction,
  sender_type: direction === "inbound" ? "customer" : "lucia",
  message_type: "text",
  content,
  delivery_status: direction === "inbound" ? "received" : "sent",
  ...extra,
});

describe("buildChatTurns", () => {
  it("junta burbujas seguidas y empieza siempre por el cliente", () => {
    const turns = buildChatTurns(
      [
        msg("outbound", "mensaje viejo del equipo"),
        msg("inbound", "Hola"),
        msg("inbound", "¿tienen pieza?"),
        msg("outbound", "¡Hola! ¿Para qué fechas?"),
      ],
      15,
    );
    expect(turns).toEqual([
      { role: "user", content: "Hola\n¿tienen pieza?" },
      { role: "assistant", content: "¡Hola! ¿Para qué fechas?" },
    ]);
  });

  it("usa solo los últimos N mensajes y describe audios sin inventar su contenido", () => {
    const turns = buildChatTurns(
      [
        msg("inbound", "uno"),
        msg("outbound", "dos"),
        msg("inbound", "", { message_type: "audio", content: null }),
      ],
      1,
    );
    expect(turns).toEqual([
      { role: "user", content: "[El cliente envió un audio]" },
    ]);
  });

  it("descarta envíos fallidos", () => {
    const turns = buildChatTurns(
      [msg("inbound", "hola"), msg("outbound", "no salió", { delivery_status: "failed" })],
      15,
    );
    expect(turns).toEqual([{ role: "user", content: "hola" }]);
  });
});

describe("usageCostUsd", () => {
  it("cobra caché de lectura al 10% y escritura al 125% de la entrada", () => {
    const cost = usageCostUsd("claude-haiku-4-5", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(1 + 5 + 0.1 + 1.25, 6);
  });

  it("cobra un modelo desconocido al precio más alto de la tabla", () => {
    expect(
      usageCostUsd("claude-desconocido", { input_tokens: 1_000_000, output_tokens: 0 }),
    ).toBe(2);
  });
});

describe("buildKnowledgeBlock", () => {
  it("es determinista y omite hostales deshabilitadas", () => {
    const hostels = [
      { code: "HU", display_name: "Hostal Uruguay", manual: "Desayuno 7-10", enabled: true, rooms: [
        { room_type: "Doble", name: "201", capacity: 2 },
        { room_type: "Doble", name: "101", capacity: 2 },
      ] },
      { code: "HOB", display_name: "Hostal Cobija", manual: "", enabled: false, rooms: [] },
      { code: "HOC", display_name: "Hostal Centro", manual: "Estacionamiento gratis", enabled: true, rooms: [] },
    ];
    const a = buildKnowledgeBlock("Lucía", "Sé amable", hostels);
    const b = buildKnowledgeBlock("Lucía", "Sé amable", [...hostels].reverse());
    expect(a).toBe(b);
    expect(a).not.toContain("Cobija");
    expect(a.indexOf("Hostal Centro")).toBeLessThan(a.indexOf("Hostal Uruguay"));
    expect(a.indexOf("101")).toBeLessThan(a.indexOf("201"));
  });
});

describe("luciaOutputSchema", () => {
  it("tolera datos de ficha mal formados sin perder la respuesta", () => {
    const parsed = luciaOutputSchema.parse({
      reply: "¡Hola! ¿Para cuántas personas?",
      intent: "algo_raro",
      answered_from_manual: false,
      needs_human: false,
      reason: null,
      prospect: {
        guest_name: "  ",
        check_in: "10 de noviembre",
        check_out: "2026-11-12",
        guests: 0,
        room_type: "Doble",
        preferences: null,
        hostel_code: "XX",
        quoted_amount: null,
      },
    });
    expect(parsed.intent).toBe("other");
    expect(parsed.prospect).toEqual({
      guest_name: null,
      check_in: null,
      check_out: "2026-11-12",
      guests: null,
      room_type: "Doble",
      preferences: null,
      hostel_code: null,
      quoted_amount: null,
    });
  });
});
