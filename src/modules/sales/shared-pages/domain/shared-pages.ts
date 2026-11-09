/** Tamaño máximo del archivo .html de una página compartida (coincide con el límite de la base de datos). */
export const SHARED_PAGE_MAX_BYTES = 2_000_000;

/** Convierte un título o nombre de enlace en un texto válido para la dirección: minúsculas, sin tildes, con guiones. */
export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: string) {
  return slug.length >= 3 && slug.length <= 60 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/** Valida el archivo subido antes de enviarlo a la base: debe ser un .html no vacío y de tamaño razonable. */
export function validateHtmlFile(file: { name: string; size: number }): string | null {
  if (!/\.html?$/i.test(file.name)) return "El archivo debe ser un .html.";
  if (file.size <= 0) return "El archivo está vacío.";
  if (file.size > SHARED_PAGE_MAX_BYTES) return "El archivo supera los 2 MB permitidos.";
  return null;
}

export function sharedPageUrl(base: string, slug: string) {
  return `${base}/p/${slug}`;
}

/**
 * Cabeceras con que se entrega una página compartida. El HTML lo sube una persona y se sirve desde el dominio del ERP,
 * por eso va dentro de un «sandbox» sin acceso al sitio (sin cookies ni sesión), pero con scripts para que el visor funcione.
 */
export function sharedPageHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
  };
}
