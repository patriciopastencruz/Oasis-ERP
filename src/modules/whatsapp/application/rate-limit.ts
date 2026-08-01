import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RateLimitCheckInput = {
  admin: SupabaseClient;
  conversationId: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitCheckResult = {
  limited: boolean;
  count: number;
};

/**
 * No hay Redis/Upstash en el repo. Esta interfaz permite reemplazar la
 * implementación por una distribuida más adelante sin tocar
 * inbound-service.ts. La limitación real: solo protege ráfagas de UN
 * mismo cliente/conversación, no un ataque coordinado desde muchos
 * números — eso requeriría infraestructura fuera del alcance de esta
 * entrega (documentado en docs/whatsapp-agent.md).
 */
export interface RateLimiter {
  check(input: RateLimitCheckInput): Promise<RateLimitCheckResult>;
}

/** Cuenta mensajes entrantes de la misma conversación en una ventana de tiempo, vía Postgres. */
export class SupabaseWindowRateLimiter implements RateLimiter {
  async check({
    admin,
    conversationId,
    limit,
    windowSeconds,
  }: RateLimitCheckInput): Promise<RateLimitCheckResult> {
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const { count } = await admin
      .from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .gte("created_at", since);
    const total = count ?? 0;
    return { limited: total > limit, count: total };
  }
}

export class NoopRateLimiter implements RateLimiter {
  async check(): Promise<RateLimitCheckResult> {
    return { limited: false, count: 0 };
  }
}

export const DEFAULT_RATE_LIMIT = { limit: 20, windowSeconds: 300 };
