"use client";

import { useEffect, useState } from "react";

/** Tiempo transcurrido desde `since` ("12 min", "1 h 05 min"), se actualiza solo. */
export function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const minutes = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000));
  const text = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
  return <span className="tabular-nums">{text}</span>;
}
