"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";

/**
 * Mantiene el tablero al día: recarga los datos del servidor cada pocos segundos
 * mientras la pestaña está visible, y muestra hace cuánto se actualizó.
 */
export function LiveRefresh({
  generatedAt,
  intervalSeconds = 30,
}: {
  generatedAt: string;
  intervalSeconds?: number;
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (paused) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, intervalSeconds * 1000);
    // Al volver a la pestaña, actualiza de inmediato.
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [paused, intervalSeconds, router]);

  const seconds = Math.max(0, Math.round((now - new Date(generatedAt).getTime()) / 1000));
  const ago = seconds < 60 ? `hace ${seconds} s` : `hace ${Math.floor(seconds / 60)} min`;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[#d9dfe6] bg-white px-3 py-1.5 text-xs text-slate-600">
      <span className="relative flex size-2">
        {!paused && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex size-2 rounded-full ${paused ? "bg-slate-400" : "bg-emerald-500"}`} />
      </span>
      <span className="font-semibold">{paused ? "En pausa" : "En vivo"}</span>
      <span>· actualizado {ago}</span>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        className="ml-1 grid size-6 place-items-center rounded-md border hover:bg-slate-50"
        aria-label={paused ? "Reanudar actualización" : "Pausar actualización"}
        title={paused ? "Reanudar" : "Pausar"}
      >
        {paused ? <Play size={12} /> : <Pause size={12} />}
      </button>
    </div>
  );
}
