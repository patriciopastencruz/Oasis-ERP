"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PdfImageButton } from "@/components/ui/pdf-image-button";

/** Fecha de corte del reporte semanal con descarga en PDF o en imagen (una por hoja) para WhatsApp. */
export function WeeklyHostelsPdfFormClient({ cutoff, max, className = "" }: { cutoff: string; max: string; className?: string }) {
  const [date, setDate] = useState(cutoff);
  return (
    <form
      action="/api/lodging/weekly-hostels.pdf"
      method="get"
      target="_blank"
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-[#d9dfe6] bg-white px-3 py-1.5 ${className}`}
    >
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        Reporte semanal 3 hostales · corte al
        <input
          type="date"
          name="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={max}
          required
          className="rounded-lg border border-[#d9dfe6] px-2 py-1 text-sm font-normal text-slate-800"
        />
      </label>
      <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b4f9c] px-3 py-1.5 text-sm font-semibold text-white">
        <Download size={15} /> PDF
      </button>
      {date && (
        <PdfImageButton
          pdfUrl={`/api/lodging/weekly-hostels.pdf?date=${date}`}
          filename={`reporte-hostales-al-${date}`}
          label="Imagen"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#0b4f9c] px-3 py-1.5 text-sm font-semibold text-[#0b4f9c] disabled:opacity-60"
        />
      )}
    </form>
  );
}
