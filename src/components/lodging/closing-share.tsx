"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";

/**
 * Descarga el PDF del cierre o lo comparte con la hoja nativa del teléfono
 * (WhatsApp aparece ahí). Si el navegador no puede compartir archivos, se
 * descarga el PDF y se abre WhatsApp con el resumen para adjuntarlo.
 */
export function ClosingShare({
  pdfUrl,
  filename,
  message,
}: {
  pdfUrl: string;
  filename: string;
  message: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Se precarga para que navigator.share ocurra dentro del mismo toque:
  // Safari/iOS rechaza compartir si antes hubo una espera de red.
  const prepared = useRef<Promise<File> | null>(null);

  function download() {
    prepared.current ??= fetch(pdfUrl)
      .then((response) => {
        if (!response.ok) throw new Error("pdf");
        return response.blob();
      })
      .then((blob) => new File([blob], filename, { type: "application/pdf" }))
      .catch((e) => {
        prepared.current = null;
        throw e;
      });
    return prepared.current;
  }

  useEffect(() => {
    download().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl]);

  function save(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const file = await download();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename, text: message });
      } else {
        save(file);
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("No fue posible generar el PDF. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  async function onlyDownload() {
    setBusy(true);
    setError(null);
    try {
      save(await download());
    } catch {
      setError("No fue posible generar el PDF. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={share}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1f9d55] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Share2 size={16} /> Compartir por WhatsApp
        </button>
        <button
          type="button"
          onClick={onlyDownload}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          <Download size={16} /> Descargar PDF
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
