/**
 * Convierte un PDF en una imagen JPG por hoja, directamente en el navegador (sin enviar nada a
 * terceros), para poder compartirlo por WhatsApp como foto. Solo se usa desde componentes de cliente.
 */
export async function pdfToImages(pdf: ArrayBuffer, options: { scale?: number; quality?: number } = {}): Promise<Blob[]> {
  const { scale = 2, quality = 0.92 } = options;
  // Se carga solo al pedir la imagen: el visor de PDF pesa y no hace falta en el resto de las pantallas.
  // Versión "legacy" para que funcione también en navegadores más antiguos.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // El trabajador del visor se ejecuta en la misma página: evita depender de un archivo aparte
  // (tipo de contenido, bloqueos) y alcanza de sobra para las pocas hojas de estos reportes.
  // @ts-expect-error el paquete no trae tipos para el trabajador del visor
  const worker = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs")) as { WorkerMessageHandler: unknown };
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = { WorkerMessageHandler: worker.WorkerMessageHandler };
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf) });
  const doc = await task.promise;
  try {
    const images: Blob[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport, background: "#ffffff" }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error("No fue posible generar la imagen.");
      images.push(blob);
      canvas.width = 0;
      canvas.height = 0;
    }
    return images;
  } finally {
    await task.destroy();
  }
}

/** Nombre de cada imagen: sin sufijo si el PDF tiene una sola hoja y "-hoja-N" si tiene varias. */
export function imageFileNames(base: string, pages: number) {
  return Array.from({ length: pages }, (_, i) => (pages === 1 ? `${base}.jpg` : `${base}-hoja-${i + 1}.jpg`));
}
