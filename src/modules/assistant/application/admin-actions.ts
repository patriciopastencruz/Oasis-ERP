"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";

const ADMIN_PATH = "/admin/assistant";

function go(key: "success" | "error", message: string): never {
  redirect(`${ADMIN_PATH}?${key}=${encodeURIComponent(message)}`);
}

async function adminContext() {
  const ctx = await requirePermission("assistant.admin.manage");
  const companyId = ctx.companies[0]?.id;
  if (!companyId) go("error", "Tu usuario no tiene una empresa asignada.");
  return { ctx, companyId, supabase: await createSupabaseServerClient() };
}

export async function updateAssistantSettingsAction(form: FormData) {
  const { companyId, supabase } = await adminContext();
  const parsed = z
    .object({
      enabled: z.coerce.boolean(),
      daily_message_limit: z.coerce.number().int().positive().max(1000),
      welcome_message: z.string().trim().max(1000),
    })
    .safeParse({
      enabled: form.get("enabled") === "on",
      daily_message_limit: form.get("daily_message_limit"),
      welcome_message: form.get("welcome_message"),
    });
  if (!parsed.success) go("error", parsed.error.issues[0].message);

  const { error } = await supabase
    .from("assistant_settings")
    .update({
      enabled: parsed.data.enabled,
      daily_message_limit: parsed.data.daily_message_limit,
      welcome_message: parsed.data.welcome_message,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId);
  if (error) go("error", "No fue posible guardar la configuración.");

  revalidatePath(ADMIN_PATH);
  go("success", "Configuración actualizada.");
}

export async function resolveUnresolvedQuestionAction(form: FormData) {
  const { companyId, ctx, supabase } = await adminContext();
  const parsed = z
    .object({
      id: z.string().uuid(),
      resolution: z.string().trim().max(2000),
    })
    .safeParse({ id: form.get("id"), resolution: form.get("resolution") });
  if (!parsed.success) go("error", parsed.error.issues[0].message);

  const { error } = await supabase
    .from("assistant_unresolved_questions")
    .update({
      status: "resolved",
      resolution: parsed.data.resolution || null,
      resolved_at: new Date().toISOString(),
      resolved_by: ctx.user.id,
    })
    .eq("id", parsed.data.id)
    .eq("company_id", companyId);
  if (error) go("error", "No fue posible marcar la pregunta como resuelta.");

  revalidatePath(ADMIN_PATH);
  go("success", "Pregunta marcada como resuelta.");
}

export async function createArticleFromQuestionAction(form: FormData) {
  const { companyId, ctx, supabase } = await adminContext();
  const parsed = z
    .object({
      question_id: z.string().uuid(),
      title: z.string().trim().min(3).max(200),
      module_key: z.string().trim().min(1).max(60),
      content: z.string().trim().min(10).max(4000),
      keywords: z.string().trim().max(500),
    })
    .safeParse({
      question_id: form.get("question_id"),
      title: form.get("title"),
      module_key: form.get("module_key"),
      content: form.get("content"),
      keywords: form.get("keywords"),
    });
  if (!parsed.success) go("error", parsed.error.issues[0].message);

  const keywords = parsed.data.keywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  const { data: article, error } = await supabase
    .from("assistant_knowledge_articles")
    .insert({
      company_id: companyId,
      title: parsed.data.title,
      module_key: parsed.data.module_key,
      content: parsed.data.content,
      keywords,
      validation_status: "verified",
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !article) go("error", "No fue posible crear el artículo.");

  await supabase
    .from("assistant_unresolved_questions")
    .update({
      status: "resolved",
      article_id: article.id,
      resolved_at: new Date().toISOString(),
      resolved_by: ctx.user.id,
      resolution: `Se creó el artículo "${parsed.data.title}".`,
    })
    .eq("id", parsed.data.question_id)
    .eq("company_id", companyId);

  revalidatePath(ADMIN_PATH);
  go("success", "Artículo creado y pregunta resuelta.");
}

export async function toggleArticleAction(form: FormData) {
  const { companyId, supabase } = await adminContext();
  const id = String(form.get("id") ?? "");
  const active = form.get("active") === "true";
  const { error } = await supabase
    .from("assistant_knowledge_articles")
    .update({ active: !active })
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) go("error", "No fue posible actualizar el artículo.");
  revalidatePath(ADMIN_PATH);
  go("success", "Artículo actualizado.");
}
