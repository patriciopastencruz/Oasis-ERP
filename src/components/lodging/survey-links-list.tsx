"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

type Item = { id: string; name: string; url: string };

/** Link de la encuesta de cada habitación, con botón para copiarlo (o copiar todos). */
export function SurveyLinksList({ items }: { items: Item[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => copy("all", items.map((i) => `${i.name}: ${i.url}`).join("\n"))}
          className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold"
        >
          <Copy size={13} /> {copied === "all" ? "Copiados" : "Copiar todos"}
        </button>
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.id} className="grid gap-1.5 py-2 sm:grid-cols-[130px_1fr_auto] sm:items-center sm:gap-3">
            <b className="text-sm">{item.name}</b>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 truncate font-mono text-xs text-[#0b4f9c] hover:underline"
            >
              {item.url}
            </a>
            <button
              type="button"
              onClick={() => copy(item.id, item.url)}
              className="inline-flex w-fit items-center gap-1 rounded-lg border bg-white px-2.5 py-1 text-xs font-semibold"
            >
              <Copy size={13} /> {copied === item.id ? "Copiado" : "Copiar"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
