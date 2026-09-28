"use client";

import { useRef, useState } from "react";

const MAX_SIDE = 1600;

/** Reduce la foto del teléfono (4–8 MB) a JPEG ~300 KB antes de enviarla. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Fotos opcionales: cámara o galería, máximo `max`, con vista previa. */
export function PhotoPicker({ name = "photos", max = 5 }: { name?: string; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function onChange() {
    const el = input.current;
    if (!el?.files) return;
    setBusy(true);
    const files = await Promise.all([...el.files].slice(0, max).map(shrink));
    try {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      el.files = dt.files;
    } catch {
      // Navegadores sin DataTransfer: se envían los originales (el servidor valida tamaño).
    }
    previews.forEach((url) => URL.revokeObjectURL(url));
    setPreviews(files.map((f) => URL.createObjectURL(f)));
    setBusy(false);
  }

  return (
    <div>
      <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-base font-bold text-slate-700">
        📷 {previews.length ? `${previews.length} foto${previews.length === 1 ? "" : "s"} · cambiar` : "Agregar fotos (opcional)"}
        <input ref={input} type="file" name={name} accept="image/*" multiple className="sr-only" onChange={onChange} />
      </label>
      {busy && <p className="mt-2 text-xs text-slate-500">Preparando fotos…</p>}
      {previews.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {previews.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-slate-500">Máximo {max} fotos.</p>
    </div>
  );
}
