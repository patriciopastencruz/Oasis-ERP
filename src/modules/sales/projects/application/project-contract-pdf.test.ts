import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildProjectContractPdf } from "./project-contract-pdf";

describe("PDF del contrato de proyecto", () => {
  it("genera un PDF válido con los datos del cliente y las cláusulas fijas", async () => {
    const bytes = await buildProjectContractPdf({
      projectNumber: "PRY-OM-2026-000001",
      contractCity: "Calama",
      contractDate: new Date("2026-06-10T12:00:00"),
      client: { company: "Julia Chávez Núñez", rut: "8.306.538-9" },
      quotationNumber: "COT-2026-001294",
      quotationDate: new Date("2026-06-10T12:00:00"),
      netIncome: 9580000,
      activities: [
        "Realizar el armado de 02 módulos tipo container.",
        "La entrega comprende la instalación terminada.",
      ],
      paymentTerms: [
        "Un pago inicial de $ 4.790.000.- y el saldo de $ 4.790.000.- el primer día hábil de trabajo de la empresa.",
      ],
    });
    expect(Buffer.from(bytes).subarray(0, 4).toString("ascii")).toBe("%PDF");
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("pagina correctamente cuando hay muchas actividades y condiciones de pago", async () => {
    const bytes = await buildProjectContractPdf({
      projectNumber: "PRY-OM-2026-000002",
      contractCity: "Calama",
      contractDate: new Date("2026-07-01T12:00:00"),
      client: { company: "Cliente de prueba con nombre largo SpA", rut: null },
      quotationNumber: null,
      quotationDate: null,
      netIncome: 15000000,
      activities: Array.from(
        { length: 20 },
        (_, i) =>
          `Actividad número ${i} con una descripción larga para forzar el salto de página del contrato generado.`,
      ),
      paymentTerms: [
        "Un pago inicial equivalente al 50% del valor total del contrato.",
        "El saldo restante contra el inicio de los trabajos en terreno.",
      ],
    });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);
  });
});
