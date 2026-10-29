/**
 * Manifiesto de la app «Oasis Hostales» (indicadores y calendarios para el
 * celular). Es aparte del de «Oasis Operaciones» (app/manifest.ts) para que
 * cada acceso directo abra su propia pantalla.
 */
export function GET() {
  return Response.json(
    {
      name: "Oasis Hostales",
      short_name: "Hostales",
      description: "Ocupación, tarifa promedio, RevPAR y calendario de los 3 hostales.",
      start_url: "/hostales",
      scope: "/hostales",
      display: "standalone",
      orientation: "portrait",
      background_color: "#f2f6fb",
      theme_color: "#0b4f9c",
      lang: "es-CL",
      icons: [
        { src: "/hostales-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/hostales-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
