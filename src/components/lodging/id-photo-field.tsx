"use client";

import { useRef, useState } from "react";

const MAX_SIDE = 2000;

/** Reduce la foto del teléfono (4–8 MB) a un JPEG liviano y legible antes de enviarla. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Una foto del documento de identidad (cámara o galería) con vista previa; viaja en el campo `name` del formulario. */
export function IdPhotoField({ name, label }: { name: string; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const show = (file: File | null) => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  async function onChange() {
    const el = input.current;
    const chosen = el?.files?.[0];
    if (!el || !chosen) return show(null);
    setBusy(true);
    const ready = await shrink(chosen);
    try {
      const dt = new DataTransfer();
      dt.items.add(ready);
      el.files = dt.files;
    } catch {
      // Navegadores sin DataTransfer: se envía la foto original (el servidor valida tipo y tamaño).
    }
    show(ready);
    setBusy(false);
  }

  function clear() {
    if (input.current) input.current.value = "";
    show(null);
  }

  return (
    <div className="text-sm">
      <span className="font-medium">{label}</span>
      <input
        ref={input}
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp,image/*"
        onChange={onChange}
        className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold"
      />
      {busy && <span className="mt-1 block text-xs text-slate-500">Preparando foto…</span>}
      {preview && (
        <div className="mt-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={label} className="h-20 w-32 rounded-lg border object-cover" />
          <button type="button" onClick={clear} className="text-xs font-semibold text-red-700">
            Quitar
          </button>
        </div>
      )}
    </div>
  );
}
