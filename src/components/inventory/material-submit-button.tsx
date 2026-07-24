"use client";
import { useFormStatus } from "react-dom";

export function MaterialSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-[#083f7d] px-4 py-3 font-semibold text-white disabled:opacity-60 md:col-span-2"
    >
      {pending ? "Creando…" : "Crear material"}
    </button>
  );
}
