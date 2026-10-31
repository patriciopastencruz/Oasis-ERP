import { describe, expect, it } from "vitest";
import { photoGrid, splitPhotosForPdf } from "./quotations";

describe("reparto de fotos en el PDF de cotización", () => {
  it("pone hasta 4 en la primera hoja", () => {
    expect(splitPhotosForPdf(0)).toEqual({ first: 0, extraPages: [] });
    expect(splitPhotosForPdf(1)).toEqual({ first: 1, extraPages: [] });
    expect(splitPhotosForPdf(4)).toEqual({ first: 4, extraPages: [] });
  });
  it("reparte el resto en páginas parejas", () => {
    expect(splitPhotosForPdf(5).extraPages).toEqual([1]);
    expect(splitPhotosForPdf(10).extraPages).toEqual([6]);
    expect(splitPhotosForPdf(15).extraPages).toEqual([6, 5]);
    expect(splitPhotosForPdf(13).extraPages).toEqual([9]);
    expect(splitPhotosForPdf(14).extraPages).toEqual([5, 5]);
  });
  it("no pierde ni repite fotos", () => {
    for (let n = 0; n <= 15; n++) {
      const { first, extraPages } = splitPhotosForPdf(n);
      expect(first + extraPages.reduce((a, b) => a + b, 0)).toBe(n);
    }
  });
  it("la cuadrícula siempre alcanza para las fotos de la página", () => {
    for (let n = 1; n <= 9; n++) {
      const { cols, rows } = photoGrid(n);
      expect(cols * rows).toBeGreaterThanOrEqual(n);
      expect(cols).toBeLessThanOrEqual(3);
    }
  });
});
