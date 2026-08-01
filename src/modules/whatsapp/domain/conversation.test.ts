import { describe, expect, it } from "vitest";
import {
  canTransitionConversationStatus,
  detectOptOut,
} from "./conversation";

describe("canTransitionConversationStatus", () => {
  it("permite escalar de IA a requiere-humano", () => {
    expect(canTransitionConversationStatus("ai_active", "human_required")).toBe(
      true,
    );
  });
  it("permite que un vendedor tome una conversación que requiere humano", () => {
    expect(
      canTransitionConversationStatus("human_required", "human_active"),
    ).toBe(true);
  });
  it("permite devolver a la IA desde atención humana", () => {
    expect(canTransitionConversationStatus("human_active", "ai_active")).toBe(
      true,
    );
  });
  it("no permite ninguna transición desde cerrada", () => {
    expect(canTransitionConversationStatus("closed", "ai_active")).toBe(false);
    expect(canTransitionConversationStatus("closed", "human_active")).toBe(
      false,
    );
  });
  it("permite cerrar desde cualquier estado no cerrado", () => {
    for (const from of [
      "ai_active",
      "human_required",
      "human_active",
      "paused",
    ] as const) {
      expect(canTransitionConversationStatus(from, "closed")).toBe(true);
    }
  });
});

describe("detectOptOut", () => {
  it("detecta BAJA, STOP y CANCELAR sin importar mayúsculas", () => {
    expect(detectOptOut("BAJA")).toBe(true);
    expect(detectOptOut("stop")).toBe(true);
    expect(detectOptOut("Cancelar")).toBe(true);
  });
  it("detecta la palabra dentro de una frase completa", () => {
    expect(detectOptOut("quiero darme de BAJA por favor")).toBe(true);
  });
  it("no dispara con palabras que solo contienen la subcadena", () => {
    expect(detectOptOut("cancelaria la reunion")).toBe(false);
  });
  it("no dispara con mensajes normales", () => {
    expect(detectOptOut("hola, quiero cotizar una casa")).toBe(false);
  });
  it("no revienta con contenido nulo o vacío", () => {
    expect(detectOptOut(null)).toBe(false);
    expect(detectOptOut(undefined)).toBe(false);
    expect(detectOptOut("")).toBe(false);
  });
});
