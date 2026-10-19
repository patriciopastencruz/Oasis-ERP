"use client";

import { useState, useSyncExternalStore } from "react";

type Info = Record<string, string>;

function read(): Info {
  const mq = (q: string) => (window.matchMedia(q).matches ? "sí" : "no");
  const vv = window.visualViewport;
  return {
    "Ancho de la ventana (px CSS)": String(window.innerWidth),
    "Alto de la ventana (px CSS)": String(window.innerHeight),
    "Ancho visible (visualViewport)": vv ? String(Math.round(vv.width)) : "—",
    "Alto visible (visualViewport)": vv ? String(Math.round(vv.height)) : "—",
    "Pantalla (screen.width x height)": `${screen.width} x ${screen.height}`,
    "Densidad de píxeles (DPR)": String(window.devicePixelRatio),
    "Píxeles reales aprox.": `${Math.round(screen.width * window.devicePixelRatio)} x ${Math.round(screen.height * window.devicePixelRatio)}`,
    "Relación ancho/alto de la ventana": (window.innerWidth / window.innerHeight).toFixed(3),
    Orientación: mq("(orientation: landscape)") === "sí" ? "horizontal" : "vertical",
    "Pantalla dividida en 2 (lado a lado)": mq("(horizontal-viewport-segments: 2)"),
    "Pantalla dividida en 2 (arriba/abajo)": mq("(vertical-viewport-segments: 2)"),
    "Puntero táctil": mq("(pointer: coarse)"),
    "Puede hacer hover": mq("(hover: hover)"),
    "Instalada como app (standalone)": mq("(display-mode: standalone)"),
    "Navegador": navigator.userAgent,
  };
}

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  window.visualViewport?.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
    window.visualViewport?.removeEventListener("resize", onChange);
  };
}
// Texto (primitivo) para que React compare por valor y solo repinte cuando algo cambia.
const snapshot = () => JSON.stringify(read());
const serverSnapshot = () => "";

/** Datos de la pantalla en vivo: se actualizan al abrir/cerrar el equipo o al girarlo. */
export function DeviceInfo() {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [copied, setCopied] = useState(false);

  if (!raw) return <p className="text-sm text-slate-500">Midiendo…</p>;
  const info = JSON.parse(raw) as Info;
  const text = Object.entries(info).map(([k, v]) => `${k}: ${v}`).join("\n");
  return (
    <div>
      <dl className="divide-y rounded-2xl border bg-white text-sm">
        {Object.entries(info).map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[1fr_1fr]">
            <dt className="text-slate-500">{k}</dt>
            <dd className="break-words font-semibold text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
        className="mt-4 w-full rounded-xl bg-[#c1652f] px-4 py-3 text-sm font-semibold text-white"
      >
        {copied ? "Copiado" : "Copiar todos los datos"}
      </button>
    </div>
  );
}
