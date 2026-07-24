import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findRelevantArticles } from "./knowledge-service";
import type { AssistantContext } from "@/modules/assistant/domain/types";

type ArticleRow = {
  id: string;
  title: string;
  module_key: string;
  route_patterns: string[];
  roles: string[];
  permissions: string[];
  keywords: string[];
  content: string;
  steps: string[];
  related_routes: unknown[];
  related_modules: string[];
  validation_status: "verified" | "pending" | "deprecated";
  active: boolean;
};

function makeSupabaseMock(rows: ArticleRow[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    then: (resolve: (v: { data: ArticleRow[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

function baseContext(
  overrides: Partial<AssistantContext> = {},
): AssistantContext {
  return {
    userId: "u1",
    userName: "Ana Test",
    roleKey: "seller",
    roleName: "Vendedora",
    permissions: ["sales.quotations.create"],
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
    ...overrides,
  };
}

function article(overrides: Partial<ArticleRow> = {}): ArticleRow {
  return {
    id: "a1",
    title: "Artículo genérico",
    module_key: "sales_quotations",
    route_patterns: [],
    roles: [],
    permissions: [],
    keywords: [],
    content: "contenido",
    steps: [],
    related_routes: [],
    related_modules: [],
    validation_status: "verified",
    active: true,
    ...overrides,
  };
}

describe("findRelevantArticles", () => {
  it("excluye artículos que exigen un permiso que el usuario no tiene", async () => {
    const supabase = makeSupabaseMock([
      article({ id: "restricted", permissions: ["finance.payments.execute"] }),
    ]);
    const results = await findRelevantArticles(
      supabase,
      "company-1",
      baseContext(),
      "cómo pago",
    );
    expect(results.find((r) => r.id === "restricted")).toBeUndefined();
  });

  it("incluye artículos sin restricción de rol/permiso para cualquier usuario", async () => {
    const supabase = makeSupabaseMock([
      article({
        id: "open",
        keywords: ["cotizacion"],
        route_patterns: ["/sales/quotations"],
      }),
    ]);
    const results = await findRelevantArticles(
      supabase,
      "company-1",
      baseContext(),
      "cotizacion",
    );
    expect(results.map((r) => r.id)).toContain("open");
  });

  it("prioriza el artículo cuya ruta coincide con la pantalla actual", async () => {
    const supabase = makeSupabaseMock([
      article({
        id: "other-route",
        route_patterns: ["/inventory/materials"],
        keywords: [],
      }),
      article({
        id: "same-route",
        route_patterns: ["/sales/quotations"],
        keywords: [],
      }),
    ]);
    const results = await findRelevantArticles(
      supabase,
      "company-1",
      baseContext(),
      "ayuda",
    );
    expect(results[0]?.id).toBe("same-route");
  });

  it("no devuelve artículos con score cero (sin relación de ruta ni palabras clave)", async () => {
    const supabase = makeSupabaseMock([
      article({
        id: "unrelated",
        route_patterns: ["/inventory/materials"],
        keywords: ["material"],
      }),
    ]);
    const results = await findRelevantArticles(
      supabase,
      "company-1",
      baseContext({
        currentScreen: {
          route: "/dashboard",
          module: "dashboard",
          title: null,
          recordId: null,
        },
      }),
      "algo sin relación",
    );
    expect(results).toHaveLength(0);
  });
});
