import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#eef3f0] p-5 text-[#17251e]">
      <section className="w-full max-w-lg rounded-3xl border border-[#d8e3dc] bg-white p-8 text-center shadow-[0_24px_80px_rgba(22,61,43,.12)]">
        <p className="text-xs font-bold tracking-[.22em] text-[#277a55]">
          OASIS ERP
        </p>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">
          Página no encontrada
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#66766d]">
          La dirección solicitada no existe o ya no está disponible.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex rounded-xl bg-[#173f2d] px-5 py-3 font-semibold text-white"
        >
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
