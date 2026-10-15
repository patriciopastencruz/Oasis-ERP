"use client";

import { useFormStatus } from "react-dom";

/** Botón de la encuesta pública: se desactiva al enviar para evitar respuestas duplicadas. */
export function SurveySubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-[#c1652f] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#a4531f] disabled:opacity-60"
    >
      {pending ? "Enviando…" : "Enviar mi opinión"}
    </button>
  );
}
