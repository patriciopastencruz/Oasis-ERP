"use client";

import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";

/** Copia el link de check-in o abre WhatsApp con el mensaje para el huésped. */
export function CheckinLinkShare({ url, message, phone }: { url: string; message: string; phone: string | null }) {
  const [copied, setCopied] = useState(false);
  const wa = `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(message)}`;
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600">{url}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border bg-white px-2.5 py-1 text-xs font-semibold"
        >
          <Copy size={13} /> {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <a
        href={wa}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-2 rounded-xl bg-[#1f9d55] px-4 py-2 text-sm font-semibold text-white"
      >
        <MessageCircle size={16} /> Enviar por WhatsApp{phone ? "" : " (elegir contacto)"}
      </a>
    </div>
  );
}
