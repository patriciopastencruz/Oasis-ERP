"use client";

import { useEffect, useState } from "react";

/** El spinner aparece si la acción tarda; antes de eso la pantalla ya está bloqueada para evitar un segundo toque. */
const SPINNER_DELAY_MS = 250;
/** Tras enviar un formulario se espera esto a que arranque la acción; si no arranca (validación, descarga) se libera. */
const SUBMIT_GRACE_MS = 600;
/** La página tarda un instante en mostrar el resultado de la acción (redirección o recarga). */
const HOLD_AFTER_MS = 500;
/** Seguro: si una petición no termina nunca, la pantalla no queda bloqueada para siempre. */
const MAX_BUSY_MS = 120_000;

/** Acciones de servidor de Next (Next-Action) y subidas directas a Supabase Storage. */
export function isTrackedMutation(input: RequestInfo | URL, init?: RequestInit) {
  const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return false;
  if (new Headers(init?.headers ?? request?.headers).has("next-action")) return true;
  return String(request?.url ?? input).includes("/storage/v1/object/");
}

/**
 * Mientras una acción de la plataforma está procesando (guardar una reserva, subir un comprobante, etc.)
 * bloquea la pantalla y muestra que está cargando, para que nadie vuelva a presionar y duplique la acción.
 */
export function PendingGuard() {
  const [busy, setBusy] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    let inFlight = 0;
    let graceOn = false;
    let holdOn = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let maxTimer: ReturnType<typeof setTimeout> | undefined;

    const isBusy = () => inFlight > 0 || graceOn || holdOn;
    const sync = () => {
      const on = isBusy();
      setBusy(on);
      if (on && maxTimer === undefined) {
        maxTimer = setTimeout(() => {
          inFlight = 0;
          graceOn = false;
          holdOn = false;
          maxTimer = undefined;
          sync();
        }, MAX_BUSY_MS);
      } else if (!on && maxTimer !== undefined) {
        clearTimeout(maxTimer);
        maxTimer = undefined;
      }
    };

    const originalFetch = window.fetch;
    const trackedFetch: typeof window.fetch = function (this: unknown, ...args: Parameters<typeof window.fetch>) {
      if (!isTrackedMutation(args[0], args[1])) return originalFetch.apply(this, args);
      inFlight++;
      graceOn = false;
      clearTimeout(graceTimer);
      sync();
      return originalFetch.apply(this, args).finally(() => {
        inFlight = Math.max(0, inFlight - 1);
        if (inFlight === 0) {
          holdOn = true;
          clearTimeout(holdTimer);
          holdTimer = setTimeout(() => {
            holdOn = false;
            sync();
          }, HOLD_AFTER_MS);
        }
        sync();
      });
    };
    window.fetch = trackedFetch;

    // Un formulario se envía una sola vez: mientras hay algo procesando, un segundo envío (Enter repetido) se ignora.
    const onSubmit = (event: Event) => {
      if (isBusy()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      graceOn = true;
      clearTimeout(graceTimer);
      graceTimer = setTimeout(() => {
        graceOn = false;
        sync();
      }, SUBMIT_GRACE_MS);
      sync();
    };
    document.addEventListener("submit", onSubmit, true);

    return () => {
      document.removeEventListener("submit", onSubmit, true);
      if (window.fetch === trackedFetch) window.fetch = originalFetch;
      clearTimeout(graceTimer);
      clearTimeout(holdTimer);
      clearTimeout(maxTimer);
    };
  }, []);

  useEffect(() => {
    if (!busy) {
      setShowSpinner(false);
      return;
    }
    const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  if (!busy) return null;
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="fixed inset-0 z-[9999] cursor-wait">
      {showSpinner && (
        <>
          <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-emerald-100">
            <div className="pending-bar h-full w-1/3 bg-emerald-600" />
          </div>
          <div className="absolute inset-0 grid place-items-center bg-white/50">
            <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-lg ring-1 ring-slate-200">
              <span className="size-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-hidden />
              <span className="text-sm font-semibold text-slate-700">Procesando… no vuelvas a presionar</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
