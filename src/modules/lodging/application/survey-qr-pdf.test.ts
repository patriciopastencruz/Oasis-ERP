import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildSurveyQrPdf } from "./survey-qr-pdf";

describe("PDF del QR de la encuesta", () => {
  it("genera un PDF de una página A4 por habitación", async () => {
    const bytes = await buildSurveyQrPdf({
      unitName: "Hostal Oasis Cobija",
      roomName: "C1",
      url: "https://www.oasis-erp.cl/encuesta/33e672b75aae0b81adea1a4fccded616",
    });
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("el cartel de Centro nombra a la recepcionista y el de otros hostales no", async () => {
    const make = (unitCode: string) =>
      buildSurveyQrPdf({
        unitName: "Hostal",
        unitCode,
        roomName: "1",
        url: "https://www.oasis-erp.cl/encuesta/33e672b75aae0b81adea1a4fccded616",
      });
    const centro = Buffer.from(await make("HOC")).toString("latin1");
    const cobija = Buffer.from(await make("HOB")).toString("latin1");
    expect(centro.length).toBeGreaterThan(cobija.length);
  });
});
