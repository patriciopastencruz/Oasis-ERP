/** Manifiesto de la app «Oasis Chats» (conversaciones de Lucía para recepción). */
export function GET() {
  return Response.json(
    {
      name: "Oasis Chats",
      short_name: "Chats",
      description: "Conversaciones del WhatsApp de las hostales atendidas por Lucía.",
      start_url: "/chats",
      scope: "/chats",
      display: "standalone",
      orientation: "portrait",
      background_color: "#efeae2",
      theme_color: "#075e54",
      lang: "es-CL",
      icons: [
        { src: "/ops-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/ops-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
