"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-[60vh] place-items-center p-5 text-[#17251e]">
      <section className="w-full max-w-lg rounded-3xl border border-[#d8e3dc] bg-white p-8 text-center">
        <h1 className="text-2xl font-semibold">
          No pudimos cargar esta sección
        </h1>
        <p className="mt-3 text-sm text-[#66766d]">
          Intenta nuevamente. Si el problema continúa, comunícate con el
          administrador.
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
  );
}
