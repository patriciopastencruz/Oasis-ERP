import { addDays, defaultClosingDate, santiagoToday } from "@/modules/lodging/domain/daily-closing";
import { WeeklyHostelsPdfFormClient } from "@/components/lodging/weekly-hostels-pdf-form-client";

/**
 * Descarga del reporte semanal de los hostales con fecha de corte. Por defecto,
 * el último día ya terminado: de madrugada el día en curso sigue siendo el de
 * ayer, así que se propone el anterior.
 */
export function WeeklyHostelsPdfForm({ className = "" }: { className?: string }) {
  return <WeeklyHostelsPdfFormClient cutoff={addDays(defaultClosingDate(), -1)} max={santiagoToday()} className={className} />;
}
