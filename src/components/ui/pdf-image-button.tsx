"use client";

import { useState } from "react";
import { ImageDown } from "lucide-react";
import { imageFileNames, pdfToImages } from "@/lib/pdf-to-images";

/**
 * Descarga un PDF como imagen (una por hoja) para enviarlo por WhatsApp. En el celular abre la hoja
 * de compartir con las imágenes; en el computador las descarga.
 */
export function PdfImageButton({
  pdfUrl,
  filename,
  label = "Descargar imagen",
  className = "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60",
}: {
  pdfUrl: string;
  /** Nombre base de los archivos, sin extensión. */
  filename: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = (file: File) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error("pdf");
      const images = await pdfToImages(await response.arrayBuffer());
      const names = imageFileNames(filename, images.length);
      const files = images.map((blob, i) => new File([blob], names[i], { type: "image/jpeg" }));
      if (navigator.canShare?.({ files })) {
        try {
          await navigator.share({ files, title: filename });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
          // Si el navegador no deja compartir tras la espera, se descargan las imágenes.
        }
      }
      files.forEach((file, i) => setTimeout(() => save(file), i * 400));
    } catch {
      setError("No fue posible generar la imagen. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={run} disabled={busy} className={className}>
        <ImageDown size={16} /> {busy ? "Generando…" : label}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
