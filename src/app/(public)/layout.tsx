import { Playfair_Display, Poppins } from "next/font/google";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["600", "700"],
});
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Grupo de rutas públicas (sin sesión, sin el shell del ERP). No hereda
// nada de (portal)/(auth) — mismo principio que (auth)/layout.tsx, pero con
// la identidad visual de Hostal Oasis Atacama en vez de la del ERP.
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${playfair.variable} ${poppins.variable} min-h-screen bg-[#faf6ef]`}
      style={{ fontFamily: "var(--font-poppins), sans-serif" }}
    >
      {children}
    </div>
  );
}
