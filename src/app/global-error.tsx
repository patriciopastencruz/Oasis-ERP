"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="es-CL">
      <body>
        <main className="grid min-h-screen place-items-center bg-[#ecf0f4] p-5 font-sans text-[#151d27]">
          <section className="w-full max-w-lg rounded-3xl border border-[#c9dbee] bg-white p-8 text-center">
            <p className="text-xs font-bold tracking-[.22em] text-[#0b4f9c]">
              OASIS ERP
            </p>
            <h1 className="mt-5 text-2xl font-semibold">
              Ocurrió un problema inesperado
            </h1>
            <p className="mt-3 text-sm text-[#5a6d82]">
              Vuelve a intentarlo para continuar trabajando.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 rounded-xl bg-[#083f7d] px-5 py-3 font-semibold text-white"
            >
              Intentar nuevamente
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
