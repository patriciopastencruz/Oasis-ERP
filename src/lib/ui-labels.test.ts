import { describe, expect, it } from "vitest";
import { uiLabel } from "./ui-labels";

describe("etiquetas visibles del ERP", () => {
  it("traduce estados y medios de pago sin cambiar su clave interna", () => {
    expect(uiLabel("pending_approval")).toBe("Pendiente de aprobación");
    expect(uiLabel("bank_transfer")).toBe("Transferencia bancaria");
    expect(uiLabel("checking")).toBe("Cuenta corriente");
  });

  it("presenta claves desconocidas de forma legible", () => {
    expect(uiLabel("custom_status")).toBe("custom status");
    expect(uiLabel(null)).toBe("—");
  });
});
