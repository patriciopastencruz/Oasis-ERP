import { DeviceInfo } from "@/components/device-info";

export const metadata = {
  title: "Medidas de pantalla | Oasis ERP",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-bold text-slate-800">Medidas de tu pantalla</h1>
      <p className="mb-5 mt-1 text-sm text-slate-500">
        Ábrela con el equipo cerrado y también abierto: los números cambian solos. Luego toca «Copiar todos los datos»
        y pégalos en el chat.
      </p>
      <DeviceInfo />
    </main>
  );
}
