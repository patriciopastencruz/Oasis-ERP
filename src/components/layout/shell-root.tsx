"use client";

import type { CSSProperties, ReactNode } from "react";
import { useIsAdminGeneral } from "@/components/layout/admin-mode";
import { useIsTransversalRoute } from "@/components/layout/transversal-mode";

const GENERIC_THEME = {
  "--oasis-page": "#f2f6fb",
  "--oasis-sidebar": "#082b59",
  "--oasis-primary": "#0b4f9c",
  "--oasis-primary-dark": "#083f7d",
  "--oasis-accent": "#0b4f9c",
  "--oasis-soft": "#edf4fc",
  "--oasis-border": "#b8cde6",
  "--oasis-avatar": "#dbe9f8",
} as CSSProperties;

export function ShellRoot({
  theme,
  children,
}: {
  theme: CSSProperties;
  children: ReactNode;
}) {
  const inAdminGeneral = useIsAdminGeneral();
  const inTransversalRoute = useIsTransversalRoute();
  return (
    <div
      style={inAdminGeneral || inTransversalRoute ? GENERIC_THEME : theme}
      className="min-h-screen bg-[var(--oasis-page)] text-[#151d27] lg:grid lg:grid-cols-[260px_1fr]"
    >
      {children}
    </div>
  );
}
