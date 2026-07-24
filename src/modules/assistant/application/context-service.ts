import "server-only";
import { requireSession } from "@/modules/platform/auth/application/session";
import type {
  AssistantContext,
  CurrentScreen,
  UiContext,
} from "@/modules/assistant/domain/types";

const EMPTY_UI_CONTEXT: UiContext = {
  visibleFields: [],
  requiredFields: [],
  availableActions: [],
  currentState: null,
  validationErrors: [],
};

/**
 * Reconstruye el contexto real del usuario en el servidor. El
 * `currentScreen`/`uiContext` que manda el cliente es solo una pista de
 * qué pantalla está viendo — nunca se usa para autorizar nada. Permisos
 * y rol siempre se recalculan aquí, nunca se confía en lo que envía el
 * cliente.
 */
export async function buildAssistantContext(clientHint?: {
  currentScreen?: Partial<CurrentScreen>;
  uiContext?: Partial<UiContext>;
}): Promise<AssistantContext> {
  const ctx = await requireSession();

  const currentScreen: CurrentScreen = {
    route:
      typeof clientHint?.currentScreen?.route === "string"
        ? clientHint.currentScreen.route
        : "/",
    module:
      typeof clientHint?.currentScreen?.module === "string"
        ? clientHint.currentScreen.module
        : null,
    title:
      typeof clientHint?.currentScreen?.title === "string"
        ? clientHint.currentScreen.title
        : null,
    recordId:
      typeof clientHint?.currentScreen?.recordId === "string"
        ? clientHint.currentScreen.recordId
        : null,
  };

  const uiContext: UiContext = {
    visibleFields: Array.isArray(clientHint?.uiContext?.visibleFields)
      ? clientHint!.uiContext!.visibleFields!.filter(
          (x) => typeof x === "string",
        )
      : EMPTY_UI_CONTEXT.visibleFields,
    requiredFields: Array.isArray(clientHint?.uiContext?.requiredFields)
      ? clientHint!.uiContext!.requiredFields!.filter(
          (x) => typeof x === "string",
        )
      : EMPTY_UI_CONTEXT.requiredFields,
    availableActions: Array.isArray(clientHint?.uiContext?.availableActions)
      ? clientHint!.uiContext!.availableActions!.filter(
          (x) => typeof x === "string",
        )
      : EMPTY_UI_CONTEXT.availableActions,
    currentState:
      typeof clientHint?.uiContext?.currentState === "string"
        ? clientHint.uiContext.currentState
        : null,
    validationErrors: Array.isArray(clientHint?.uiContext?.validationErrors)
      ? clientHint!.uiContext!.validationErrors!.filter(
          (x) => typeof x === "string",
        )
      : EMPTY_UI_CONTEXT.validationErrors,
  };

  return {
    userId: ctx.user.id,
    userName:
      `${ctx.profile.first_name ?? ""} ${ctx.profile.last_name ?? ""}`.trim(),
    roleKey: ctx.role?.key ?? null,
    roleName: ctx.role?.name ?? null,
    permissions: Array.from(ctx.permissions),
    currentScreen,
    uiContext,
  };
}
