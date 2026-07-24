"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { synchronizeCalendars } from "@/modules/lodging/application/actions";

export function SyncButton({ unitId }: { unitId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function run() {
    setBusy(true);
    setMessage("");
    const result = await synchronizeCalendars(unitId);
    setBusy(false);
    setMessage(
      result.ok
        ? "Calendarios actualizados correctamente"
        : "No fue posible actualizar los calendarios. Intente nuevamente.",
    );
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 4500);
  }
  return (
    <div className="relative">
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-[#0b4f9c] bg-white px-4 py-2.5 text-sm font-semibold text-[#0b4f9c] disabled:opacity-60"
      >
        <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
        {busy ? "Actualizando calendarios…" : "Actualizar calendarios"}
      </button>
      {message && (
        <div
          role="status"
          className="absolute right-0 top-12 z-30 w-72 rounded-xl bg-[#083f7d] px-4 py-3 text-sm text-white shadow-xl"
        >
          {message}
        </div>
      )}
    </div>
  );
}
