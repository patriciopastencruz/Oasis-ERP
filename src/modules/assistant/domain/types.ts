export type AssistantAction =
  | { type: "navigate"; label: string; route: string }
  | { type: "highlight"; label: string; elementId: string }
  | { type: "open_modal"; label: string; modalKey: string }
  | { type: "suggestion"; label: string; prompt: string };

export type AssistantSource = { id: string; title: string };

export type AssistantResponse = {
  success: boolean;
  message: string;
  actions: AssistantAction[];
  suggestions: string[];
  sources: AssistantSource[];
  missingFields: string[];
  resolved: boolean;
  conversationId: string;
  errorCode?:
    | "not_configured"
    | "disabled"
    | "rate_limited"
    | "provider_error"
    | "unauthorized";
};

export type KnowledgeArticle = {
  id: string;
  title: string;
  moduleKey: string;
  routePatterns: string[];
  roles: string[];
  permissions: string[];
  keywords: string[];
  content: string;
  steps: string[];
  relatedRoutes: {
    label: string;
    route: string;
    requiredPermission?: string;
  }[];
  relatedModules: string[];
  validationStatus: "verified" | "pending" | "deprecated";
  isActive: boolean;
};

export type CurrentScreen = {
  route: string;
  module: string | null;
  title: string | null;
  recordId: string | null;
};

export type UiContext = {
  visibleFields: string[];
  requiredFields: string[];
  availableActions: string[];
  currentState: string | null;
  validationErrors: string[];
};

/** Contexto reconstruido en el servidor — nunca confía en permisos enviados por el cliente. */
export type AssistantContext = {
  userId: string;
  userName: string;
  roleKey: string | null;
  roleName: string | null;
  permissions: string[];
  currentScreen: CurrentScreen;
  uiContext: UiContext;
};

export type AssistantInput = {
  message: string;
  context: AssistantContext;
  history: { role: "user" | "assistant"; content: string }[];
  articles: KnowledgeArticle[];
};

export type AssistantProviderResult = {
  message: string;
  actions: AssistantAction[];
  suggestions: string[];
  missingFields: string[];
  resolved: boolean;
  usedArticleIds: string[];
};
