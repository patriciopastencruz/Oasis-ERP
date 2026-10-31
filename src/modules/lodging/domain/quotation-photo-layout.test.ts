import { describe, expect, it } from "vitest";
import { splitPhotosForPdf } from "./quotations";

describe("reparto de fotos en el PDF de cotización", () => {
  it("pone hasta 4 en la primera hoja", () => {
    expect(splitPhotosForPdf(0)).toEqual({ first: 0, extraPages: [] });
    expect(splitPhotosForPdf(1)).toEqual({ first: 1, extraPages: [] });
    expect(splitPhotosForPdf(4)).toEqual({ first: 4, extraPages: [] });
  });
  it("llena cada hoja adicional (9 fotos) antes de pasar a la siguiente", () => {
    expect(splitPhotosForPdf(5).extraPages).toEqual([1]);
    expect(splitPhotosForPdf(10).extraPages).toEqual([6]);
    expect(splitPhotosForPdf(13).extraPages).toEqual([9]);
    expect(splitPhotosForPdf(14).extraPages).toEqual([9, 1]);
    expect(splitPhotosForPdf(15).extraPages).toEqual([9, 2]);
    expect(splitPhotosForPdf(14, 0).extraPages).toEqual([9, 5]);
  });
  it("no pierde ni repite fotos y solo la última hoja queda incompleta", () => {
    for (let n = 0; n <= 15; n++) {
      for (const firstPage of [4, 0]) {
        const { first, extraPages } = splitPhotosForPdf(n, firstPage);
        expect(first + extraPages.reduce((a, b) => a + b, 0)).toBe(n);
        for (const count of extraPages.slice(0, -1)) expect(count).toBe(9);
      }
    }
  });
});
