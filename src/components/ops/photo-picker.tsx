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

/** Fotos opcionales: cámara o galería, máximo `max`, con vista previa. Cada selección se suma a las anteriores; `min` solo orienta. */
export function PhotoPicker({ name = "photos", max = 5, min }: { name?: string; max?: number; min?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /** Deja en el campo del formulario exactamente las fotos elegidas hasta ahora. */
  function apply(next: File[]) {
    const el = input.current;
    try {
      const dt = new DataTransfer();
      next.forEach((f) => dt.items.add(f));
      if (el) el.files = dt.files;
    } catch {
      // Navegadores sin DataTransfer: se envía solo la última selección (el servidor valida tamaño).
    }
    previews.forEach((url) => URL.revokeObjectURL(url));
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  }

  async function onChange() {
    const el = input.current;
    if (!el?.files) return;
    setBusy(true);
    const added = await Promise.all([...el.files].slice(0, Math.max(0, max - files.length)).map(shrink));
    apply([...files, ...added]);
    setBusy(false);
  }

  const full = files.length >= max;
  return (
    <div>
      <label
        className={`flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-base font-bold text-slate-700 ${full ? "opacity-50" : "cursor-pointer"}`}
      >
        📷 {files.length ? `${files.length} foto${files.length === 1 ? "" : "s"} · agregar más` : "Agregar fotos (opcional)"}
        <input ref={input} type="file" name={name} accept="image/*" multiple disabled={full} className="sr-only" onChange={onChange} />
      </label>
      {busy && <p className="mt-2 text-xs text-slate-500">Preparando fotos…</p>}
      {previews.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {previews.map((src, i) => (
            <div key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="aspect-square w-full rounded-lg object-cover" />
              <button
                type="button"
                aria-label={`Quitar foto ${i + 1}`}
                onClick={() => apply(files.filter((_, j) => j !== i))}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-xs font-bold text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-slate-500">
        {min ? `Entre ${min} y ${max} fotos recomendadas.` : `Máximo ${max} fotos.`}
        {files.length > 0 && min && files.length < min ? ` Te faltan ${min - files.length} para el mínimo recomendado.` : ""}
      </p>
    </div>
  );
}
