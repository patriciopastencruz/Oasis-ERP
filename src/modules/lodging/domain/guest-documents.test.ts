import { describe, expect, it } from "vitest";
import { readDocumentPhoto, readDocumentPhotos } from "./guest-documents";

const file = (bytes: number[], name = "doc.jpg", pad = 0) =>
  new File([new Uint8Array([...bytes, ...new Array(pad).fill(0)])], name);
const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

describe("fotos del documento de identidad", () => {
  it("acepta JPG, PNG y WEBP por su contenido", async () => {
    expect(await readDocumentPhoto(file(jpeg))).toMatchObject({ mime: "image/jpeg", ext: "jpg" });
    expect(await readDocumentPhoto(file([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "a.png"))).toMatchObject({ ext: "png" });
    const webp = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")];
    expect(await readDocumentPhoto(file(webp, "a.webp"))).toMatchObject({ ext: "webp" });
  });

  it("rechaza PDF, otros formatos y archivos de más de 10 MB", async () => {
    expect(await readDocumentPhoto(file([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "a.pdf"))).toBe("invalid");
    expect(await readDocumentPhoto(file([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], "a.jpg"))).toBe("invalid");
    expect(await readDocumentPhoto(file(jpeg, "grande.jpg", 10 * 1024 * 1024))).toBe("invalid");
  });

  it("sin archivo elegido no hay foto (campo vacío del formulario)", async () => {
    expect(await readDocumentPhoto(null)).toBeNull();
    expect(await readDocumentPhoto(new File([], ""))).toBeNull();
  });

  it("lee solo el frente del formulario y marca el inválido", async () => {
    const form = new FormData();
    form.set("document_front", file(jpeg));
    form.set("document_back", file(jpeg));
    expect(await readDocumentPhotos(form)).toEqual({ front: expect.objectContaining({ mime: "image/jpeg" }) });
    form.set("document_front", file([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], "x.jpg"));
    expect(await readDocumentPhotos(form)).toBe("invalid");
    expect(await readDocumentPhotos(new FormData())).toEqual({ front: null });
  });
});
