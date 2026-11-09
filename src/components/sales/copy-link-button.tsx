"use client";

import { useState } from "react";

/** Copia el enlace al portapapeles y avisa un instante. */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:border-[var(--oasis-primary)]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          window.prompt("Copia el enlace:", url);
        }
      }}
    >
      {copied ? "Copiado" : "Copiar enlace"}
    </button>
  );
}
