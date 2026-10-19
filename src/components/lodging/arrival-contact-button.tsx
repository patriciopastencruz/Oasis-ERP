"use client";

import { useState, useTransition } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { prepareArrivalContactAction } from "@/modules/lodging/application/arrival-actions";

/** Marcador que recepción debe reemplazar antes de enviar (por ejemplo, la clave provisoria de la entrada principal). */
const PENDING_MARK = /por definir/i;

/**
 * Prepara el mensaje de bienvenida y lo deja editable: recepción lo revisa, completa lo que diga
 * "Por definir" y recién ahí lo abre en WhatsApp con el texto final.
 */
export function ArrivalContactButton({ reservationId, contacted }: { reservationId: string; contacted: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState<{ text: string; phone: string | null } | null>(null);

  const prepare = () => {
    setError(null);
    start(async () => {
      const res = await prepareArrivalContactAction(reservationId);
      if (!res.ok) setError(res.error);
      else setDraft({ text: res.message, phone: res.phone });
    });
  };

  if (!draft)
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={prepare}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#1f9d55] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          <MessageCircle size={14} /> {pending ? "Preparando…" : contacted ? "Reenviar mensaje" : "Enviar bienvenida"}
        </button>
        {error && <p className="text-[11px] text-red-700">{error}</p>}
      </div>
    );

  const unresolved = PENDING_MARK.test(draft.text);
  return (
    <div className="w-full max-w-xl space-y-2 rounded-xl border bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-700">Revisa y edita el mensaje antes de enviarlo</p>
      <textarea
        value={draft.text}
        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        rows={14}
        className="w-full rounded-lg border bg-white px-3 py-2 text-xs leading-relaxed"
        aria-label="Mensaje de bienvenida"
      />
      {unresolved && (
        <p className="rounded-lg bg-amber-50 p-2 text-[11px] font-semibold text-amber-800">
          El mensaje dice «Por definir»: reemplázalo por el dato real (por ejemplo, la clave de la entrada principal) antes de enviarlo.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {draft.phone ? (
          <button
            type="button"
            onClick={() => window.open(`https://wa.me/${draft.phone}?text=${encodeURIComponent(draft.text)}`, "_blank", "noopener")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1f9d55] px-3 py-1.5 text-xs font-semibold text-white"
          >
            <MessageCircle size={14} /> Abrir en WhatsApp
          </button>
        ) : (
          <span className="text-[11px] text-amber-800">Sin teléfono válido: copia el mensaje y envíalo por otro medio.</span>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(draft.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-1.5 text-xs font-semibold"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copiado" : "Copiar"}
        </button>
        <button type="button" onClick={() => setDraft(null)} className="text-xs font-semibold text-slate-500 underline">
          Cerrar
        </button>
      </div>
    </div>
  );
}
