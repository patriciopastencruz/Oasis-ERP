"use client";

import { usePathname } from "next/navigation";
import generatedModules from "@/assistant/knowledge/generated-modules.json";
import type { ERPModuleDefinition } from "@/assistant/knowledge/types";

const modules = generatedModules as ERPModuleDefinition[];

function detectModule(pathname: string): {
  moduleKey: string | null;
  title: string | null;
} {
  for (const mod of modules) {
    for (const route of mod.routes) {
      if (route.path === pathname)
        return { moduleKey: mod.key, title: route.label };
      if (
        route.path.endsWith("/*") &&
        pathname.startsWith(route.path.slice(0, -1))
      ) {
        return { moduleKey: mod.key, title: route.label };
      }
    }
  }
  return { moduleKey: null, title: null };
}

export function useCurrentScreen() {
  const pathname = usePathname() ?? "/";
  const { moduleKey, title } = detectModule(pathname);
  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  const recordId =
    lastSegment && /^[0-9a-f-]{8,}$/i.test(lastSegment) ? lastSegment : null;
  return { route: pathname, module: moduleKey, title, recordId };
}
