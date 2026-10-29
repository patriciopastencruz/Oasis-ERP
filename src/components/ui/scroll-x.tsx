"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

type Metrics = { scrollWidth: number; clientWidth: number; scrollLeft: number };

/**
 * Contenedor para tablas anchas. Dibuja arriba una barra horizontal propia que acompaña al desplazarse por la página,
 * porque la barra nativa queda al final de la tabla (fuera de pantalla con muchas filas) y en Mac se oculta sola.
 */
export function ScrollX({ children, className = "" }: { children: ReactNode; className?: string }) {
  const mainRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Metrics>({ scrollWidth: 0, clientWidth: 0, scrollLeft: 0 });

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const read = () => setM({ scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, scrollLeft: main.scrollLeft });
    read();
    main.addEventListener("scroll", read, { passive: true });
    const observer = new ResizeObserver(read);
    observer.observe(main);
    if (main.firstElementChild) observer.observe(main.firstElementChild);
    return () => {
      main.removeEventListener("scroll", read);
      observer.disconnect();
    };
  }, []);

  const overflowing = m.scrollWidth > m.clientWidth + 1;
  const ratio = overflowing ? m.clientWidth / m.scrollWidth : 1;
  const maxScroll = m.scrollWidth - m.clientWidth;

  // Mover la barra: arrastrar el control o tocar el riel para ir a ese punto.
  const move = (clientX: number, grabOffset: number) => {
    const track = trackRef.current;
    const main = mainRef.current;
    if (!track || !main) return;
    const rect = track.getBoundingClientRect();
    const thumbWidth = rect.width * ratio;
    const free = rect.width - thumbWidth;
    if (free <= 0) return;
    const left = Math.min(Math.max(clientX - rect.left - grabOffset, 0), free);
    main.scrollLeft = (left / free) * maxScroll;
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const thumbLeft = (maxScroll > 0 ? (m.scrollLeft / maxScroll) * (rect.width - rect.width * ratio) : 0);
    const onThumb = event.clientX >= rect.left + thumbLeft && event.clientX <= rect.left + thumbLeft + rect.width * ratio;
    const grab = onThumb ? event.clientX - rect.left - thumbLeft : (rect.width * ratio) / 2;
    track.setPointerCapture(event.pointerId);
    move(event.clientX, grab);
    const onMove = (e: PointerEvent) => move(e.clientX, grab);
    const onUp = () => {
      track.removeEventListener("pointermove", onMove);
      track.removeEventListener("pointerup", onUp);
      track.removeEventListener("pointercancel", onUp);
    };
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", onUp);
    track.addEventListener("pointercancel", onUp);
  };

  return (
    <div className={className}>
      {overflowing && (
        <div className="sticky top-0 z-10 -mx-1 bg-white px-1 py-1.5">
          <div
            ref={trackRef}
            onPointerDown={onPointerDown}
            role="scrollbar"
            aria-orientation="horizontal"
            aria-label="Desplazar la tabla hacia los lados"
            aria-controls="scroll-x-content"
            aria-valuemin={0}
            aria-valuemax={Math.round(maxScroll)}
            aria-valuenow={Math.round(m.scrollLeft)}
            tabIndex={-1}
            className="relative h-3 cursor-pointer touch-none rounded-full bg-[#e3e8ee]"
          >
            <div
              className="absolute inset-y-0 rounded-full bg-[#7d8c9d] hover:bg-[#5f6f82]"
              style={{ width: `${ratio * 100}%`, left: `${maxScroll > 0 ? (m.scrollLeft / maxScroll) * (100 - ratio * 100) : 0}%` }}
            />
          </div>
        </div>
      )}
      <div ref={mainRef} id="scroll-x-content" className="scroll-x-visible overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
