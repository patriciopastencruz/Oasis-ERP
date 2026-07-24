import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/modules/platform/auth/application/session";
import { buildAssistantContext } from "@/modules/assistant/application/context-service";
import { findRelevantArticles } from "@/modules/assistant/application/knowledge-service";
import { validateActions } from "@/modules/assistant/application/action-validator";
import { READ_TOOLS } from "@/modules/assistant/tools/read-tools";
import { AnthropicAssistantProvider } from "@/modules/assistant/providers/anthropic-provider";
import {
  AIProviderNotConfiguredError,
  AIProviderRequestError,
} from "@/modules/assistant/providers/ai-provider";
import type { AssistantResponse } from "@/modules/assistant/domain/types";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  currentScreen: z
    .object({
      route: z.string().max(300).optional(),
      module: z.string().max(100).nullable().optional(),
      title: z.string().max(200).nullable().optional(),
      recordId: z.string().max(100).nullable().optional(),
    })
    .optional(),
  uiContext: z
    .object({
      visibleFields: z.array(z.string()).max(60).optional(),
      requiredFields: z.array(z.string()).max(60).optional(),
      availableActions: z.array(z.string()).max(60).optional(),
      currentState: z.string().nullable().optional(),
      validationErrors: z.array(z.string()).max(30).optional(),
    })
    .optional(),
});

function errorResponse(
  status: number,
  errorCode: AssistantResponse["errorCode"],
  message: string,
  conversationId = "",
): NextResponse {
  const body: AssistantResponse = {
    success: false,
    message,
    actions: [],
    suggestions: [],
    sources: [],
    missingFields: [],
    resolved: false,
    conversationId,
    errorCode,
  };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse(400, "provider_error", "Solicitud inválida.");
  }
  const input = parsed.data;

  const session = await getSessionContext();
  if (!session) {
    return errorResponse(401, "unauthorized", "Debes iniciar sesión.");
  }

  const companyId = session.companies[0]?.id;
  if (!companyId) {
    return errorResponse(
      403,
      "unauthorized",
      "Tu usuario no tiene una empresa asignada.",
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data: settings } = await supabase
    .from("assistant_settings")
    .select("enabled,daily_message_limit,welcome_message")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!settings?.enabled) {
    return errorResponse(
      403,
      "disabled",
      "El Asistente ERP está deshabilitado por un administrador.",
    );
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count: messagesToday } = await supabase
    .from("assistant_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.user.id)
    .eq("role", "user")
    .gte("created_at", startOfDay.toISOString());

  if ((messagesToday ?? 0) >= settings.daily_message_limit) {
    return errorResponse(
      429,
      "rate_limited",
      "Alcanzaste el límite diario de consultas al asistente. Intenta nuevamente mañana.",
    );
  }

  let conversationId = input.conversationId;
  if (conversationId) {
    const { data: existing } = await supabase
      .from("assistant_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!existing) conversationId = undefined;
  }
  if (!conversationId) {
    const { data: created, error } = await supabase
      .from("assistant_conversations")
      .insert({
        company_id: companyId,
        user_id: session.user.id,
        title: input.message.slice(0, 80),
        current_module: input.currentScreen?.module ?? null,
        current_route: input.currentScreen?.route ?? null,
      })
      .select("id")
      .single();
    if (error || !created) {
      return errorResponse(
        500,
        "provider_error",
        "No fue posible iniciar la conversación.",
      );
    }
    conversationId = created.id;
  } else {
    await supabase
      .from("assistant_conversations")
      .update({
        current_module: input.currentScreen?.module ?? null,
        current_route: input.currentScreen?.route ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  }
  if (!conversationId) {
    return errorResponse(
      500,
      "provider_error",
      "No fue posible resolver la conversación.",
    );
  }

  const { data: historyRows } = await supabase
    .from("assistant_messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(10);
  const history = (historyRows ?? [])
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const context = await buildAssistantContext({
    currentScreen: input.currentScreen ?? undefined,
    uiContext: input.uiContext ?? undefined,
  });

  await supabase.from("assistant_messages").insert({
    conversation_id: conversationId,
    user_id: session.user.id,
    role: "user",
    content: input.message,
  });

  const articles = await findRelevantArticles(
    supabase,
    companyId,
    context,
    input.message,
  );

  const provider = new AnthropicAssistantProvider();
  if (!provider.isConfigured()) {
    return errorResponse(
      200,
      "not_configured",
      "El servicio de IA aún no está configurado. Contacta a un administrador para activarlo.",
      conversationId,
    );
  }

  const availableTools = READ_TOOLS.filter(
    (t) =>
      !t.requiredPermission || session.permissions.has(t.requiredPermission),
  );

  try {
    const result = await provider.generateResponse(
      { message: input.message, context, history, articles },
      availableTools,
      { assistantContext: context, supabase },
    );

    const validActions = validateActions(result.actions, context);
    const usedArticles = articles.filter((a) =>
      result.usedArticleIds.includes(a.id),
    );

    await supabase.from("assistant_messages").insert({
      conversation_id: conversationId,
      user_id: session.user.id,
      role: "assistant",
      content: result.message,
      metadata: {
        actions: validActions,
        suggestions: result.suggestions,
        missingFields: result.missingFields,
        sourceIds: usedArticles.map((a) => a.id),
        resolved: result.resolved,
      },
    });

    if (!result.resolved) {
      await supabase.from("assistant_unresolved_questions").insert({
        company_id: companyId,
        user_id: session.user.id,
        conversation_id: conversationId,
        question: input.message,
        module: context.currentScreen.module,
        route: context.currentScreen.route,
        context: { uiContext: context.uiContext },
      });
    }

    const response: AssistantResponse = {
      success: true,
      message: result.message,
      actions: validActions,
      suggestions: result.suggestions,
      sources: usedArticles.map((a) => ({ id: a.id, title: a.title })),
      missingFields: result.missingFields,
      resolved: result.resolved,
      conversationId,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AIProviderNotConfiguredError) {
      return errorResponse(
        200,
        "not_configured",
        error.message,
        conversationId,
      );
    }
    if (error instanceof AIProviderRequestError) {
      return errorResponse(
        502,
        "provider_error",
        error.message,
        conversationId,
      );
    }
    console.error(error);
    return errorResponse(
      500,
      "provider_error",
      "Ocurrió un error inesperado al procesar tu consulta.",
      conversationId,
    );
  }
}
