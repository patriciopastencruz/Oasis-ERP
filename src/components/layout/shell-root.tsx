"use client";

import type { CSSProperties, ReactNode } from "react";
import { useIsAdminGeneral } from "@/components/layout/admin-mode";
import { useIsTransversalRoute } from "@/components/layout/transversal-mode";

const GENERIC_THEME = {
  "--oasis-page": "#f2f5f3",
  "--oasis-sidebar": "#123525",
  "--oasis-primary": "#176b46",
  "--oasis-primary-dark": "#12583a",
  "--oasis-accent": "#277a55",
  "--oasis-soft": "#f2f7f4",
  "--oasis-border": "#bcd2c5",
  "--oasis-avatar": "#dceee4",
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
      className="min-h-screen bg-[var(--oasis-page)] text-[#17251e] lg:grid lg:grid-cols-[260px_1fr]"
    >
      {children}
    </div>
  );
}
