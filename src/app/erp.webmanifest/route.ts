/**
 * Manifiesto de la app «Oasis ERP» (el ERP completo para el celular: aprobar,
 * revisar y operar). Es aparte de los de Operaciones, Hostales y Chats para que
 * cada acceso directo abra su propia pantalla. «/» lleva a cada persona a su
 * inicio según sus permisos.
 */
export function GET() {
  return Response.json(
    {
      name: "Oasis ERP",
      short_name: "Oasis ERP",
      description: "Aprobaciones, finanzas, hostales y operación de Oasis en el celular.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "any",
      background_color: "#f2f6fb",
      theme_color: "#082b59",
      lang: "es-CL",
      icons: [
        { src: "/erp-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/erp-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
