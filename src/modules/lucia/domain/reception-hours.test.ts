import { describe, expect, it } from "vitest";
import { afterHoursArrivalReply, arrivesToday, hostelAddress, mentionsAddress, receptionState } from "./reception-hours";

const cobija = { reception_open_time: "10:30:00", reception_close_time: "19:30:00", reception_close_time_weekend: null };
const centro = { reception_open_time: "09:00:00", reception_close_time: "23:30:00", reception_close_time_weekend: "19:00:00" };
// Chile en noviembre: UTC-3.
const at = (iso: string) => new Date(`${iso}-03:00`);

describe("receptionState", () => {
  it("abre y cierra según la hora de Chile", () => {
    expect(receptionState(cobija, at("2026-11-01T21:31")).open).toBe(false);
    expect(receptionState(cobija, at("2026-11-02T00:10")).open).toBe(false);
    expect(receptionState(cobija, at("2026-11-02T10:00")).open).toBe(false);
    expect(receptionState(cobija, at("2026-11-02T10:30")).open).toBe(true);
    expect(receptionState(cobija, at("2026-11-02T19:29"))).toEqual({ open: true, opens: "10:30", closes: "19:30" });
  });

  it("usa el cierre de fin de semana", () => {
    expect(receptionState(centro, at("2026-11-02T22:00")).open).toBe(true); // lunes
    expect(receptionState(centro, at("2026-11-01T20:00")).open).toBe(false); // domingo
  });
});

describe("dirección", () => {
  it("se toma del manual y se reconoce en un mensaje", () => {
    expect(hostelAddress("- Dirección: Cobija 3207, Calama. Referencia: pasando Arena Restobar.")).toBe("Cobija 3207");
    expect(hostelAddress("- Dirección: Uruguay 2462, Calama (esquina Uruguay con Coquimbo).")).toBe("Uruguay 2462");
    expect(hostelAddress("Sin dirección cargada")).toBeNull();
    expect(mentionsAddress("Hospedaje Oasis Cobija está en Cobija 3207, Calama", "Cobija 3207")).toBe(true);
    expect(mentionsAddress("Queda en cobija #3207", "Cobija 3207")).toBe(true);
    expect(mentionsAddress("Hospedaje Oasis Cobija, cercano a Pedro de Valdivia", "Cobija 3207")).toBe(false);
  });

  it("fuera de horario pide coordinar antes con recepción", () => {
    const reply = afterHoursArrivalReply([{ code: "HOB", name: "Hospedaje Oasis Cobija", address: "Cobija 3207", opens: "10:30", closes: "19:30" }]);
    expect(reply).toContain("Hospedaje Oasis Cobija ya cerró por hoy (atiende de 10:30 a 19:30)");
    expect(reply).toContain("coordinarlo antes con recepción");
    expect(reply).not.toContain("3207");
  });
});

describe("arrivesToday", () => {
  it("la regla de fuera de horario es solo para llegadas de hoy", () => {
    expect(arrivesToday("2026-11-04", "2026-11-04")).toBe(true);
    expect(arrivesToday(null, "2026-11-04")).toBe(true);
    expect(arrivesToday("2026-11-06", "2026-11-04")).toBe(false);
  });
});
