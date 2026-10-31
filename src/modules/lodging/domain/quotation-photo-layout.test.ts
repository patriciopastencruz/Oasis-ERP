import { describe, expect, it } from "vitest";
import { splitPhotosForPdf } from "./quotations";

describe("reparto de fotos en el PDF de cotización", () => {
  it("no pone fotos en la primera hoja", () => {
    expect(splitPhotosForPdf(0)).toEqual({ first: 0, extraPages: [] });
    expect(splitPhotosForPdf(1)).toEqual({ first: 0, extraPages: [1] });
  });
  it("llena cada hoja adicional (9 fotos) antes de pasar a la siguiente", () => {
    expect(splitPhotosForPdf(4).extraPages).toEqual([4]);
    expect(splitPhotosForPdf(9).extraPages).toEqual([9]);
    expect(splitPhotosForPdf(10).extraPages).toEqual([9, 1]);
    expect(splitPhotosForPdf(15).extraPages).toEqual([9, 6]);
  });
  it("no pierde ni repite fotos y solo la última hoja queda incompleta", () => {
    for (let n = 0; n <= 15; n++) {
      const { first, extraPages } = splitPhotosForPdf(n);
      expect(first + extraPages.reduce((a, b) => a + b, 0)).toBe(n);
      for (const count of extraPages.slice(0, -1)) expect(count).toBe(9);
    }
  });
});
