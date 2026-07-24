import { describe, expect, it } from "vitest";
import { validateActions } from "./action-validator";
import type {
  AssistantAction,
  AssistantContext,
} from "@/modules/assistant/domain/types";

function baseContext(permissions: string[]): AssistantContext {
  return {
    userId: "u1",
    userName: "Ana Test",
    roleKey: "seller",
    roleName: "Vendedora",
    permissions,
    currentScreen: {
      route: "/sales/quotations",
      module: "sales_quotations",
      title: null,
      recordId: null,
    },
    uiContext: {
      visibleFields: [],
      requiredFields: [],
      availableActions: [],
      currentState: null,
      validationErrors: [],
    },
  };
}

describe("validateActions", () => {
  it("descarta una navegación a una ruta que no existe en el inventario", () => {
    const actions: AssistantAction[] = [
      {
        type: "navigate",
        label: "Ir a algo inventado",
        route: "/no-existe/en-serio",
      },
    ];
    const result = validateActions(
      actions,
      baseContext(["sales.quotations.create"]),
    );
    expect(result).toHaveLength(0);
  });

  it("descarta una navegación a una ruta real si el usuario no tiene el permiso requerido", () => {
    const actions: AssistantAction[] = [
      { type: "navigate", label: "Ir a Roles", route: "/admin/roles" },
    ];
    const result = validateActions(
      actions,
      baseContext(["sales.quotations.create"]),
    );
    expect(result).toHaveLength(0);
  });

  it("acepta una navegación a una ruta real cuando el usuario tiene el permiso", () => {
    const actions: AssistantAction[] = [
      {
        type: "navigate",
        label: "Nueva cotización",
        route: "/sales/quotations/new",
      },
    ];
    const result = validateActions(
      actions,
      baseContext(["sales.quotations.create"]),
    );
    expect(result).toHaveLength(1);
  });

  it("acepta una navegación a una ruta pública sin permiso (permission: null)", () => {
    const actions: AssistantAction[] = [
      { type: "navigate", label: "Notificaciones", route: "/notifications" },
    ];
    const result = validateActions(actions, baseContext([]));
    expect(result).toHaveLength(1);
  });

  it("resuelve rutas con patrón comodín (detalle dinámico)", () => {
    const actions: AssistantAction[] = [
      {
        type: "navigate",
        label: "Ver cotización",
        route: "/sales/quotations/9f6c9a2e-1111-4444-8888-000000000000",
      },
    ];
    const result = validateActions(
      actions,
      baseContext(["sales.quotations.create"]),
    );
    expect(result).toHaveLength(1);
  });

  it("siempre acepta acciones de tipo suggestion", () => {
    const actions: AssistantAction[] = [
      {
        type: "suggestion",
        label: "¿Cómo apruebo una cotización?",
        prompt: "¿Cómo apruebo una cotización?",
      },
    ];
    const result = validateActions(actions, baseContext([]));
    expect(result).toHaveLength(1);
  });
});
