import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssistantContext,
  KnowledgeArticle,
} from "@/modules/assistant/domain/types";

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
  related_routes: {
    label: string;
    route: string;
    requiredPermission?: string;
  }[];
  related_modules: string[];
  validation_status: "verified" | "pending" | "deprecated";
  active: boolean;
};

function toArticle(row: ArticleRow): KnowledgeArticle {
  return {
    id: row.id,
    title: row.title,
    moduleKey: row.module_key,
    routePatterns: row.route_patterns ?? [],
    roles: row.roles ?? [],
    permissions: row.permissions ?? [],
    keywords: row.keywords ?? [],
    content: row.content,
    steps: row.steps ?? [],
    relatedRoutes: row.related_routes ?? [],
    relatedModules: row.related_modules ?? [],
    validationStatus: row.validation_status,
    isActive: row.active,
  };
}

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

function routeMatchScore(route: string, patterns: string[]): number {
  if (patterns.length === 0) return 0;
  let best = 0;
  for (const pattern of patterns) {
    const prefix = pattern.replace(/\*$/, "");
    if (route === pattern) best = Math.max(best, 6);
    else if (pattern.endsWith("*") && route.startsWith(prefix))
      best = Math.max(best, 4);
    else if (route.startsWith(pattern)) best = Math.max(best, 3);
  }
  return best;
}

/**
 * Filtra y pondera artículos de conocimiento por permiso del usuario,
 * módulo/ruta actual, y superposición de palabras clave con la
 * pregunta. Sin embeddings en esta etapa — coincidencia léxica simple,
 * preparada para reemplazarse por búsqueda vectorial más adelante.
 */
export async function findRelevantArticles(
  supabase: SupabaseClient,
  companyId: string,
  context: AssistantContext,
  query: string,
  limit = 6,
): Promise<KnowledgeArticle[]> {
  const { data, error } = await supabase
    .from("assistant_knowledge_articles")
    .select(
      "id,title,module_key,route_patterns,roles,permissions,keywords,content,steps,related_routes,related_modules,validation_status,active",
    )
    .eq("company_id", companyId)
    .eq("active", true)
    .neq("validation_status", "deprecated");

  if (error || !data) return [];

  const permissionSet = new Set(context.permissions);
  const roleKey = context.roleKey;
  const queryWords = normalize(query);
  const route = context.currentScreen.route;
  const currentModule = context.currentScreen.module;

  const visible = (data as ArticleRow[]).filter((row) => {
    const hasRoleGate = (row.roles ?? []).length > 0;
    const hasPermissionGate = (row.permissions ?? []).length > 0;
    if (!hasRoleGate && !hasPermissionGate) return true;
    const roleOk = hasRoleGate && roleKey ? row.roles.includes(roleKey) : false;
    const permOk = hasPermissionGate
      ? row.permissions.some((p) => permissionSet.has(p))
      : false;
    return roleOk || permOk;
  });

  const scored = visible.map((row) => {
    const article = toArticle(row);
    let relevance = routeMatchScore(route, article.routePatterns);
    if (currentModule && article.moduleKey === currentModule) relevance += 2;
    const keywordHits = article.keywords.filter((k) =>
      queryWords.includes(k.toLowerCase()),
    ).length;
    relevance += keywordHits * 2;
    const titleWords = normalize(article.title);
    relevance += queryWords.filter((w) => titleWords.includes(w)).length;
    // El bono de "verificado" solo desempata el orden entre artículos ya
    // relevantes — nunca alcanza por sí solo para cruzar el umbral de
    // relevancia (evitaría devolver artículos sin relación real).
    const score =
      relevance + (article.validationStatus === "verified" ? 0.5 : 0);
    return { article, relevance, score };
  });

  return scored
    .filter((s) => s.relevance > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.article);
}
