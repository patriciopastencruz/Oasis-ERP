import "server-only";
import type {
  AssistantAction,
  AssistantContext,
} from "@/modules/assistant/domain/types";
import type {
  ERPModuleDefinition,
  ERPRoute,
} from "@/assistant/knowledge/types";
import generatedModules from "@/assistant/knowledge/generated-modules.json";

const modules = generatedModules as ERPModuleDefinition[];

function findRoute(path: string): ERPRoute | null {
  for (const mod of modules) {
    if (!mod.isActive) continue;
    for (const route of mod.routes) {
      if (route.path === path) return route;
      if (
        route.path.endsWith("/*") &&
        path.startsWith(route.path.slice(0, -1))
      ) {
        return route;
      }
    }
  }
  return null;
}

/**
 * Valida que una acción propuesta por el modelo sea real: la ruta debe
 * existir en el inventario verificado y el usuario debe tener el
 * permiso que esa ruta exige. Cualquier acción que no pase esta
 * validación se descarta antes de llegar a pantalla — así ningún link
 * inventado ni acceso no autorizado llega al usuario.
 */
export function validateActions(
  actions: AssistantAction[],
  context: AssistantContext,
): AssistantAction[] {
  const permissionSet = new Set(context.permissions);
  return actions.filter((action) => {
    if (action.type === "suggestion") return true;
    if (action.type === "highlight" || action.type === "open_modal") {
      return typeof action.label === "string" && action.label.length > 0;
    }
    if (action.type === "navigate") {
      const route = findRoute(action.route);
      if (!route) return false;
      if (route.permission && !permissionSet.has(route.permission))
        return false;
      return true;
    }
    return false;
  });
}
