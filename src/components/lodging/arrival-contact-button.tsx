"use client";

import { useState, useTransition } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { prepareArrivalContactAction } from "@/modules/lodging/application/arrival-actions";

/**
 * Abre WhatsApp con el mensaje de bienvenida ya escrito. La ventana se abre en el clic (para que el
 * navegador no la bloquee) y se completa cuando el servidor termina de preparar el mensaje.
 */
export function ArrivalContactButton({ reservationId, contacted }: { reservationId: string; contacted: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    setFallback(null);
    const popup = window.open("", "_blank");
    start(async () => {
      const res = await prepareArrivalContactAction(reservationId);
      if (!res.ok) {
        popup?.close();
        setError(res.error);
        return;
      }
      if (res.waUrl && popup) popup.location.href = res.waUrl;
      else {
        popup?.close();
        // Sin teléfono válido: se ofrece copiar el mensaje para enviarlo por otro medio.
        setFallback(res.message);
      }
    });
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[#1f9d55] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        <MessageCircle size={14} /> {pending ? "Preparando…" : contacted ? "Reenviar mensaje" : "Enviar bienvenida"}
      </button>
      {error && <p className="text-[11px] text-red-700">{error}</p>}
      {fallback && (
        <div className="rounded-lg border bg-slate-50 p-2 text-[11px] text-slate-600">
          <p className="mb-1">Sin teléfono válido: copia el mensaje.</p>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(fallback);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
            className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 font-semibold"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copiado" : "Copiar mensaje"}
          </button>
        </div>
      )}
    </div>
  );
}
