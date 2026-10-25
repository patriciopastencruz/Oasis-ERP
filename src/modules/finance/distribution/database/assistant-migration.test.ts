import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const core = readFileSync("supabase/migrations/20261025100000_dist_assistant_core.sql", "utf8");
const functions = readFileSync("supabase/migrations/20261025110000_dist_assistant_functions.sql", "utf8");

describe("migración del asistente de pedidos de la distribuidora", () => {
  it("protege todas las tablas con RLS, solo lectura para usuarios y sin using(true)", () => {
    for (const table of ["dist_wa_settings", "dist_wa_conversations", "dist_wa_messages", "dist_wa_order_links", "dist_wa_usage_daily", "dist_wa_events"]) {
      expect(core).toContain(`alter table public.${table} enable row level security`);
    }
    expect(core).toContain("revoke all on public.dist_wa_settings,public.dist_wa_conversations");
    expect(core).toMatch(/grant select on public\.dist_wa_settings[^;]*to authenticated/);
    expect(core).not.toContain("using(true)");
    expect(core.match(/has_permission\('distribution\.assistant\.view'\)/g)?.length).toBe(6);
  });

  it("lleva empresa y unidad en cada tabla y los índices operativos", () => {
    expect(core.match(/foreign key\(company_id,business_unit_id\) references public\.business_units\(company_id,id\)/g)?.length).toBeGreaterThanOrEqual(6);
    expect(core).toContain("create index dist_wa_conversations_unit_idx");
    expect(core).toContain("create unique index dist_wa_messages_external_idx");
    expect(core).toContain("create index dist_wa_events_time_idx");
  });

  it("el pedido lo crea una función que reutiliza dist_create_order y solo service_role la ejecuta", () => {
    expect(core).toContain("v_order:=public.dist_create_order(order_payload)");
    expect(core).toContain("revoke execute on function public.dist_wa_create_order(uuid,jsonb) from public,anon,authenticated");
    expect(core).toContain("grant execute on function public.dist_wa_create_order(uuid,jsonb) to service_role");
    expect(core).toContain("revoke execute on function public.dist_wa_quote_order(uuid,jsonb) from public,anon,authenticated");
    expect(core).toContain("revoke execute on function public.dist_wa_find_customers(uuid,text) from public,anon,authenticated");
  });

  it("aplica los topes y reglas del asistente antes de crear", () => {
    expect(core).toContain("El plazo para pedidos del mismo dia termino");
    expect(core).toContain("No hay reparto ese dia de la semana");
    expect(core).toContain("REVISION: una linea supera");
    expect(core).toContain("REVISION: el total supera");
    expect(core).toContain("Un cliente nuevo no puede comprar a credito");
  });

  it("solo quien configura guarda los ajustes y no se activa sin usuario firmante", () => {
    expect(core).toMatch(/dist_wa_save_settings[\s\S]*has_permission\('distribution\.assistant\.settings'\)/);
    expect(core).toContain("Para activar el asistente elige a nombre de quien se crean los pedidos");
    expect(core).toContain("grant execute on function public.dist_wa_save_settings(jsonb) to authenticated");
  });

  it("las funciones de apoyo son solo de service_role", () => {
    for (const fn of ["dist_wa_price_list(uuid,uuid)", "dist_wa_record_usage(jsonb)", "dist_wa_flag_conversation(uuid,text,text,boolean)"]) {
      expect(functions).toContain(`revoke execute on function public.${fn} from public,anon,authenticated`);
      expect(functions).toContain(`grant execute on function public.${fn} to service_role`);
    }
  });
});

const whatsapp = readFileSync("supabase/migrations/20261025120000_dist_assistant_whatsapp.sql", "utf8");

describe("migración de la conexión de WhatsApp del asistente de la distribuidora", () => {
  it("la sesión de WhatsApp solo la ve service_role", () => {
    expect(whatsapp).toContain("alter table public.dist_wa_auth enable row level security");
    expect(whatsapp).toContain("revoke all on public.dist_wa_auth from public,anon,authenticated");
    expect(whatsapp).toContain("grant select,insert,update,delete on public.dist_wa_auth to service_role");
    expect(whatsapp).not.toMatch(/create policy[^;]*dist_wa_auth/);
  });

  it("las funciones del worker son solo de service_role", () => {
    for (const fn of [
      "dist_wa_worker_status(jsonb)",
      "dist_wa_ingest_message(jsonb)",
      "dist_wa_claim_outbound(uuid)",
      "dist_wa_mark_outbound(jsonb)",
      "dist_wa_resume_after_pause(uuid)",
    ]) {
      expect(whatsapp).toContain(`revoke execute on function public.${fn} from public,anon,authenticated`);
      expect(whatsapp).toContain(`grant execute on function public.${fn} to service_role`);
    }
  });

  it("el QR solo lo entrega a quien configura y mientras espera el escaneo", () => {
    expect(whatsapp).toMatch(/dist_wa_connection_qr[\s\S]*has_permission\('distribution\.assistant\.settings'\)/);
    expect(whatsapp).toContain("s.connection_status<>'qr_pending'");
  });

  it("ignora equipo y contactos excluidos, evita duplicados, pausa si el equipo escribe y respeta el límite por minuto", () => {
    expect(whatsapp).toContain("s.ignored_phones||s.notify_phones");
    expect(whatsapp).toContain("'duplicate'");
    expect(whatsapp).toContain("make_interval(mins=>s.pause_minutes)");
    expect(whatsapp).toContain("recent>=s.max_messages_per_minute");
    expect(whatsapp).toContain("for update skip locked");
  });
});
