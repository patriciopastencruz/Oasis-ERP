import type { Metadata, Viewport } from "next";
import { oasisTheme } from "@/components/layout/oasis-theme";
import { requireSession } from "@/modules/platform/auth/application/session";

// App «Oasis Chats»: las conversaciones de Lucía en formato tipo WhatsApp para
// que recepción responda desde el celular. Pide sesión del ERP y usa los
// mismos permisos y reglas de acceso que la bandeja de Lucía.
export const metadata: Metadata = {
  title: "Oasis Chats",
  manifest: "/chats.webmanifest",
  appleWebApp: { capable: true, title: "Oasis Chats", statusBarStyle: "default" },
  icons: { icon: "/ops-icon-192.png", apple: "/ops-icon-180.png" },
};
export const viewport: Viewport = { themeColor: "#075e54", width: "device-width", initialScale: 1 };

export default async function ChatsLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="min-h-[100dvh] bg-[#efeae2]" style={oasisTheme}>
      <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col bg-[#efeae2] shadow-sm">{children}</div>
    </div>
  );
}
