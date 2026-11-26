"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useDesktopMenu } from "@/components/layout/shell-root";

/** Oculta o muestra el menú lateral cuando la pantalla es ancha (iPhone plegable abierto, tabletas, escritorio). */
export function DesktopMenuToggle() {
  const { hidden, toggle } = useDesktopMenu();
  const Icon = hidden ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={hidden ? "Mostrar menú lateral" : "Ocultar menú lateral"}
      aria-pressed={hidden}
      title={hidden ? "Mostrar menú" : "Ocultar menú"}
      className="hidden size-10 shrink-0 place-items-center rounded-full border md:grid"
    >
      <Icon size={19} />
    </button>
  );
}
