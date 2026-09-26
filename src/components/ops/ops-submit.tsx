"use client";

import { useFormStatus } from "react-dom";

/** Botón grande de acción: se desactiva al enviar para evitar dobles toques. */
export function OpsSubmit({
  children,
  className = "",
  name,
  value,
  confirmMessage,
}: {
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
  confirmMessage?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      onClick={(e) => {
        if (confirmMessage && !confirm(confirmMessage)) e.preventDefault();
      }}
      className={`flex h-14 w-full items-center justify-center rounded-2xl text-base font-bold transition active:scale-[0.99] disabled:opacity-60 ${className}`}
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}
