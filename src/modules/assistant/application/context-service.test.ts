import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/platform/auth/application/session", () => ({
  requireSession: vi.fn(async () => ({
    user: { id: "u1" },
    profile: { first_name: "Ana", last_name: "Vendedora" },
    role: { key: "seller", name: "Vendedora" },
    permissions: new Set(["sales.quotations.create"]),
    companies: [],
    units: [],
  })),
}));

const { buildAssistantContext } = await import("./context-service");

describe("buildAssistantContext", () => {
  it("usa siempre los permisos calculados en el servidor, nunca los del cliente", async () => {
    const maliciousHint = {
      currentScreen: {
        route: "/admin/roles",
        module: "administration",
        title: null,
        recordId: null,
      },
      // El tipo de entrada no acepta "permissions", pero se simula un intento
      // de inyectar permisos vía un objeto adicional para confirmar que se ignora.
      permissions: ["administration.roles.manage", "assistant.admin.manage"],
    } as unknown as Parameters<typeof buildAssistantContext>[0];

    const context = await buildAssistantContext(maliciousHint);

    expect(context.permissions).toEqual(["sales.quotations.create"]);
    expect(context.permissions).not.toContain("administration.roles.manage");
  });

  it("usa el hint de pantalla del cliente solo como referencia, no como autorización", async () => {
    const context = await buildAssistantContext({
      currentScreen: {
        route: "/admin/roles",
        module: "administration",
        title: "Roles",
        recordId: null,
      },
    });
    expect(context.currentScreen.route).toBe("/admin/roles");
    expect(context.permissions).toEqual(["sales.quotations.create"]);
  });

  it("normaliza campos de uiContext ausentes a arrays/valores vacíos", async () => {
    const context = await buildAssistantContext();
    expect(context.uiContext.visibleFields).toEqual([]);
    expect(context.uiContext.currentState).toBeNull();
  });
});
