import { describe, expect, it } from "vitest";
import { chatTime, daySeparator, needsAttention, previewText } from "./chat-ui";

const now = new Date("2026-10-24T15:00:00-03:00");

describe("needsAttention", () => {
  const base = { needs_review: false, booking_status: "none", unanswered_since: null };

  it("marca derivados, reservas por confirmar y pagos por revisar", () => {
    expect(needsAttention({ ...base, needs_review: true }, now)).toBe(true);
    expect(needsAttention({ ...base, booking_status: "awaiting_reception" }, now)).toBe(true);
    expect(needsAttention({ ...base, booking_status: "proof_received" }, now)).toBe(true);
    expect(needsAttention({ ...base, booking_status: "confirmed" }, now)).toBe(false);
  });

  it("un mensaje del cliente sin respuesta por más de 2 minutos espera a una persona", () => {
    expect(needsAttention({ ...base, unanswered_since: "2026-10-24T14:59:30-03:00" }, now)).toBe(false);
    expect(needsAttention({ ...base, unanswered_since: "2026-10-24T14:50:00-03:00" }, now)).toBe(true);
  });
});

describe("previewText y horas", () => {
  it("muestra quién escribió y reemplaza archivos por su tipo", () => {
    expect(previewText({ direction: "inbound", sender_type: "customer", message_type: "text", content: "Hola\n¿tienen pieza?" })).toBe("Hola ¿tienen pieza?");
    expect(previewText({ direction: "outbound", sender_type: "lucia", message_type: "text", content: "¡Hola!" })).toBe("Lucía: ¡Hola!");
    expect(previewText({ direction: "inbound", sender_type: "customer", message_type: "image", content: null })).toBe("📷 Foto");
    expect(previewText(undefined)).toBe("Sin mensajes");
  });

  it("hora si es de hoy, «Ayer» o la fecha", () => {
    expect(chatTime("2026-10-24T10:05:00-03:00", now)).toBe("10:05");
    expect(chatTime("2026-10-23T20:00:00-03:00", now)).toBe("Ayer");
    expect(chatTime("2026-10-20T09:00:00-03:00", now)).toBe("20-10");
    expect(daySeparator("2026-10-24T08:00:00-03:00", now)).toBe("Hoy");
    expect(daySeparator("2026-10-20T09:00:00-03:00", now)).toBe("martes, 20 de octubre");
  });
});
