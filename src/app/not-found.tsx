import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#ecf0f4] p-5 text-[#151d27]">
      <section className="w-full max-w-lg rounded-3xl border border-[#c9dbee] bg-white p-8 text-center shadow-[0_24px_80px_rgba(22,61,43,.12)]">
        <p className="text-xs font-bold tracking-[.22em] text-[#0b4f9c]">
          OASIS ERP
        </p>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">
          Página no encontrada
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#5a6d82]">
          La dirección solicitada no existe o ya no está disponible.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex rounded-xl bg-[#083f7d] px-5 py-3 font-semibold text-white"
        >
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
