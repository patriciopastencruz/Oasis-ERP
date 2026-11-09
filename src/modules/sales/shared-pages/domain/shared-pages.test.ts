import { describe, expect, it } from "vitest";
import { SHARED_PAGE_MAX_BYTES, isValidSlug, sharedPageHeaders, sharedPageUrl, slugify, validateHtmlFile } from "./shared-pages";

describe("páginas compartidas", () => {
  it("convierte un título en un enlace válido", () => {
    expect(slugify("Casa Modular 36 m²")).toBe("casa-modular-36-m2");
    expect(slugify("  Cotización Ñandú — Obra #2  ")).toBe("cotizacion-nandu-obra-2");
    expect(slugify("%%%")).toBe("");
    expect(slugify("a".repeat(80)).length).toBe(60);
  });

  it("valida el formato del enlace", () => {
    expect(isValidSlug("casa-modular-36m2")).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("Casa-Modular")).toBe(false);
    expect(isValidSlug("casa--modular")).toBe(false);
    expect(isValidSlug("-casa")).toBe(false);
  });

  it("solo acepta archivos .html no vacíos y de hasta 2 MB", () => {
    expect(validateHtmlFile({ name: "visor.html", size: 1200 })).toBeNull();
    expect(validateHtmlFile({ name: "VISOR.HTM", size: 1200 })).toBeNull();
    expect(validateHtmlFile({ name: "visor.pdf", size: 1200 })).toMatch(/\.html/);
    expect(validateHtmlFile({ name: "visor.html", size: 0 })).toMatch(/vacío/);
    expect(validateHtmlFile({ name: "visor.html", size: SHARED_PAGE_MAX_BYTES + 1 })).toMatch(/2 MB/);
  });

  it("arma el enlace con el dominio del ERP", () => {
    expect(sharedPageUrl("https://www.oasis-erp.cl", "casa-36")).toBe("https://www.oasis-erp.cl/p/casa-36");
  });

  it("entrega la página aislada del sitio y sin indexar", () => {
    const h = sharedPageHeaders();
    expect(h["Content-Security-Policy"]).toContain("sandbox");
    expect(h["Content-Security-Policy"]).not.toContain("allow-same-origin");
    expect(h["Content-Type"]).toContain("text/html");
    expect(h["X-Robots-Tag"]).toContain("noindex");
  });
});
