"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="es-CL">
      <body>
        <main className="grid min-h-screen place-items-center bg-[#eef3f0] p-5 font-sans text-[#17251e]">
          <section className="w-full max-w-lg rounded-3xl border border-[#d8e3dc] bg-white p-8 text-center">
            <p className="text-xs font-bold tracking-[.22em] text-[#277a55]">
              OASIS ERP
            </p>
            <h1 className="mt-5 text-2xl font-semibold">
              Ocurrió un problema inesperado
            </h1>
            <p className="mt-3 text-sm text-[#66766d]">
              Vuelve a intentarlo para continuar trabajando.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 rounded-xl bg-[#173f2d] px-5 py-3 font-semibold text-white"
            >
              Intentar nuevamente
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
