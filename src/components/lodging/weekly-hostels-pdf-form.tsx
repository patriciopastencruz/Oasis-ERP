import { Download } from "lucide-react";
import { addDays, defaultClosingDate, santiagoToday } from "@/modules/lodging/domain/daily-closing";

/**
 * Descarga del reporte semanal de los hostales con fecha de corte. Por defecto,
 * el último día ya terminado: de madrugada el día en curso sigue siendo el de
 * ayer, así que se propone el anterior.
 */
export function WeeklyHostelsPdfForm({ className = "" }: { className?: string }) {
  const cutoff = addDays(defaultClosingDate(), -1);
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
          defaultValue={cutoff}
          max={santiagoToday()}
          required
          className="rounded-lg border border-[#d9dfe6] px-2 py-1 text-sm font-normal text-slate-800"
        />
      </label>
      <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b4f9c] px-3 py-1.5 text-sm font-semibold text-white">
        <Download size={15} /> PDF
      </button>
    </form>
  );
}
