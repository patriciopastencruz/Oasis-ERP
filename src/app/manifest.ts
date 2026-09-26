import type { MetadataRoute } from "next";

/** PWA "Oasis Operaciones": se agrega a la pantalla de inicio y abre el portal operativo. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oasis Operaciones",
    short_name: "Oasis Ops",
    description: "Portal operativo de los hostales Oasis: aseo, inspección y supervisión.",
    start_url: "/ops",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f6fa",
    theme_color: "#0b2f5f",
    lang: "es-CL",
    icons: [
      { src: "/ops-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/ops-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
