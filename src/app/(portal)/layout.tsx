import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/modules/platform/auth/application/session";

// «Oasis ERP» se puede agregar a la pantalla de inicio del celular como app.
export const metadata: Metadata = {
  manifest: "/erp.webmanifest",
  appleWebApp: { capable: true, title: "Oasis ERP", statusBarStyle: "default" },
  icons: { icon: "/erp-icon-192.png", apple: "/erp-icon-180.png" },
};
// viewport-fit=cover deja usar las zonas seguras del iPhone (barra inferior).
export const viewport: Viewport = {
  themeColor: "#082b59",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell ctx={await requireSession()}>{children}</AppShell>;
}
