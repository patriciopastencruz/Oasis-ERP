import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260801140652_whatsapp_agent.sql",
  ),
  "utf8",
);

describe("esquema del agente de WhatsApp", () => {
  it("crea las tablas principales del módulo", () => {
    expect(sql).toContain("create table public.whatsapp_integrations");
    expect(sql).toContain("create table public.crm_leads");
    expect(sql).toContain("create table public.whatsapp_conversations");
    expect(sql).toContain("create table public.whatsapp_messages");
    expect(sql).toContain("create table public.whatsapp_integration_events");
  });

  it("nunca almacena secretos de Twilio/Meta en la base de datos", () => {
    expect(sql).not.toContain("auth_token");
    expect(sql).not.toContain("access_token");
    expect(sql).not.toContain("api_key");
  });

  it("restringe el estado de conversación a los 5 valores del diseño", () => {
    expect(sql).toContain(
      "status in('ai_active','human_required','human_active','paused','closed')",
    );
  });

  it("garantiza idempotencia del mensaje entrante por proveedor + id externo", () => {
    expect(sql).toContain(
      "create unique index whatsapp_messages_external_idx on public.whatsapp_messages(provider,external_message_id) where external_message_id is not null",
    );
  });

  it("permite a lo más una conversación abierta por lead e integración", () => {
    expect(sql).toContain(
      "create unique index whatsapp_conversations_open_idx on public.whatsapp_conversations(integration_id,lead_id) where status<>'closed'",
    );
  });

  it("trata la unidad de negocio con FK compuesta en todas las tablas", () => {
    for (const table of [
      "whatsapp_integrations",
      "crm_leads",
      "whatsapp_conversations",
      "whatsapp_messages",
    ]) {
      const fromTable = sql.indexOf(`create table public.${table}`);
      const nextTable = sql.indexOf("create table", fromTable + 1);
      const body = sql.slice(
        fromTable,
        nextTable === -1 ? undefined : nextTable,
      );
      expect(body).toContain(
        "foreign key(company_id,business_unit_id) references public.business_units(company_id,id)",
      );
    }
  });
});

describe("resolución de company_id desde el número receptor", () => {
  it("la integración se busca por (provider, to_number), nunca por un company_id del payload", () => {
    const fn = sql.slice(
      sql.indexOf("function public.whatsapp_ingest_inbound_message"),
      sql.indexOf("revoke execute on function public.whatsapp_ingest_inbound_message"),
    );
    expect(fn).toContain(
      "select * into integ from public.whatsapp_integrations where provider=provider_name and phone_number_e164=to_number",
    );
    expect(fn).not.toContain("payload->>'company_id'");
  });

  it("rechaza silenciosamente números desconocidos o integraciones deshabilitadas", () => {
    expect(sql).toContain("jsonb_build_object('status','unknown_number')");
    expect(sql).toContain("jsonb_build_object('status','disabled'");
  });

  it("detecta duplicados antes de invocar al agente", () => {
    expect(sql).toContain("jsonb_build_object('status','duplicate'");
  });

  it("detecta baja/opt-out y cierra la conversación sin más automatización", () => {
    expect(sql).toContain("\\y(baja|stop|cancelar)\\y");
    expect(sql).toContain("status='discarded'");
    expect(sql).toContain("close_reason='opt_out'");
  });
});

describe("funciones restringidas a service_role (sin sesión de usuario)", () => {
  it("revoca la ejecución de las funciones de ingesta a public/anon/authenticated", () => {
    for (const fn of [
      "whatsapp_ingest_inbound_message(jsonb)",
      "whatsapp_escalate_to_human(uuid,text)",
      "whatsapp_record_agent_message(jsonb)",
      "whatsapp_record_delivery_status(jsonb)",
      "whatsapp_record_integration_event(jsonb)",
    ]) {
      expect(sql).toContain(
        `revoke execute on function public.${fn} from public,anon,authenticated`,
      );
      expect(sql).toContain(`grant execute on function public.${fn} to service_role`);
    }
  });
});

describe("permisos y RLS", () => {
  it("declara los 7 permisos del namespace whatsapp", () => {
    for (const key of [
      "whatsapp.inbox.view",
      "whatsapp.inbox.reply",
      "whatsapp.conversations.assign",
      "whatsapp.agent.control",
      "whatsapp.leads.view",
      "whatsapp.leads.manage",
      "whatsapp.settings.manage",
    ]) {
      expect(sql).toContain(key);
    }
  });

  it("habilita RLS en las 5 tablas nuevas", () => {
    for (const table of [
      "whatsapp_integrations",
      "crm_leads",
      "whatsapp_conversations",
      "whatsapp_messages",
      "whatsapp_integration_events",
    ]) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("nunca usa una política abierta using(true)", () => {
    expect(sql).not.toContain("using(true)");
    expect(sql).not.toContain("using (true)");
  });

  it("usa can_access_unit y has_permission, reutilizando el sistema existente", () => {
    expect(sql).toContain("public.can_access_unit(company_id,business_unit_id)");
    expect(sql).toContain("public.has_permission('whatsapp.inbox.view')");
  });

  it("la bandeja es compartida: inbox.view da acceso a todas las conversaciones, no solo a las asignadas", () => {
    expect(sql).toContain(
      "assigned_user_id=(select auth.uid()) or public.has_permission('whatsapp.inbox.view')",
    );
  });

  it("registra auditoría reutilizando el trigger genérico existente", () => {
    expect(sql).toContain(
      "create trigger audit_whatsapp_integrations after insert or update or delete on public.whatsapp_integrations for each row execute function public.audit_row_change()",
    );
    expect(sql).toContain(
      "create trigger audit_crm_leads after insert or update or delete on public.crm_leads for each row execute function public.audit_row_change()",
    );
  });

  it("no audita whatsapp_messages (el mensaje ya es el registro histórico)", () => {
    expect(sql).not.toContain("audit_whatsapp_messages");
  });
});

describe("created_by nullable en crm_leads (única excepción documentada)", () => {
  it("permite created_by nulo porque el agente crea leads sin usuario", () => {
    const table = sql.slice(
      sql.indexOf("create table public.crm_leads"),
      sql.indexOf("create unique index crm_leads_phone_idx"),
    );
    expect(table).toContain("created_by uuid references public.profiles(id)");
    expect(table).not.toContain(
      "created_by uuid not null references public.profiles(id)",
    );
    expect(table).toContain("created_via text not null default 'agent'");
  });
});
