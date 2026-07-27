import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260727010000_om_projects.sql"),
  "utf8",
);

describe("esquema de om_projects", () => {
  it("crea las tablas principales del módulo", () => {
    expect(sql).toContain("create table public.om_project_sequences");
    expect(sql).toContain("create table public.om_projects");
    expect(sql).toContain("create table public.om_project_members");
    expect(sql).toContain("create table public.om_project_expenses");
    expect(sql).toContain("create table public.om_project_expense_attachments");
    expect(sql).toContain("create table public.om_project_documents");
    expect(sql).toContain("create table public.om_project_notes");
    expect(sql).toContain("create table public.om_project_status_history");
  });

  it("restringe el estado a los 5 valores básicos", () => {
    expect(sql).toContain(
      "status in('pending','manufacturing','installation','done','cancelled')",
    );
  });

  it("permite a lo más un proyecto por cotización sin perder el flujo cuando es manual", () => {
    expect(sql).toContain(
      "quotation_id uuid references public.om_quotations(id)",
    );
    expect(sql).toContain("unique(quotation_id)");
  });

  it("exige responsable obligatorio y trata la unidad de negocio con FK compuesta", () => {
    expect(sql).toContain(
      "responsible_id uuid not null references public.profiles(id)",
    );
    expect(sql).toContain(
      "foreign key(company_id,business_unit_id) references public.business_units(company_id,id)",
    );
  });
});

describe("montos e IVA de los gastos", () => {
  it("usa numeric para dinero, nunca punto flotante", () => {
    expect(sql).toContain("net_amount numeric(14,2)");
    expect(sql).toContain("iva_amount numeric(14,2)");
    expect(sql).toContain("total_amount numeric(14,2)");
  });

  it("calcula IVA y total en un trigger de servidor, no en el navegador", () => {
    expect(sql).toContain("om_calc_project_expense_totals");
    expect(sql).toContain(
      "new.iva_amount:=case when new.is_exempt then 0 else round(new.net_amount*0.19,2) end",
    );
    expect(sql).toContain("new.total_amount:=new.net_amount+new.iva_amount");
    expect(sql).toContain("before insert or update of net_amount,is_exempt");
  });

  it("restringe las categorías a un catálogo fijo y consistente", () => {
    expect(sql).toContain(
      "category in('materiales','mano_de_obra','transporte','instalacion','alimentacion','alojamiento','subcontratos','herramientas','combustible','otros')",
    );
  });

  it("anula gastos en vez de borrarlos físicamente", () => {
    expect(sql).toContain("status text not null default 'active' check(status in('active','voided'))");
    expect(sql).toContain("om_void_project_expense");
    expect(sql).not.toContain("delete from public.om_project_expenses");
  });
});

describe("correlativo del proyecto", () => {
  it("usa un contador atómico por unidad y año, igual que cotizaciones", () => {
    expect(sql).toContain("public.om_next_project_sequence");
    expect(sql).toContain(
      "on conflict(business_unit_id,year) do update set last_value=public.om_project_sequences.last_value+1",
    );
  });

  it("arma el número con el formato PRY-OM-<año>-<secuencia>", () => {
    expect(sql).toContain("format('PRY-OM-%s-%s'");
  });
});

describe("conversión de cotización a proyecto", () => {
  it("exige que la cotización esté aprobada o entregada", () => {
    expect(sql).toContain("if q.status not in('approved','delivered')");
  });

  it("impide asociar dos proyectos a la misma cotización", () => {
    expect(sql).toContain(
      "if exists(select 1 from public.om_projects where quotation_id=q.id)",
    );
  });

  it("copia una fotografía comercial y no referencia montos en vivo", () => {
    expect(sql).toContain("q.net,q.iva,q.total");
  });
});

describe("transiciones de estado", () => {
  it("permite pending->manufacturing->installation->done y el salto directo sin instalación", () => {
    expect(sql).toContain("p.status='pending' and target_status='manufacturing'");
    expect(sql).toContain(
      "p.status='manufacturing' and target_status in('installation','done')",
    );
    expect(sql).toContain("p.status='installation' and target_status='done'");
  });
});

describe("cierre, reapertura y cancelación", () => {
  it("exige observación final para cerrar", () => {
    expect(sql).toContain("om_close_project");
    expect(sql).toContain("Debes indicar una observacion final");
  });
  it("solo permite reabrir proyectos finalizados y exige permiso especial", () => {
    expect(sql).toContain("sales.projects.reopen");
    expect(sql).toContain("if p.status<>'done' then raise exception");
  });
  it("exige motivo de cancelación", () => {
    expect(sql).toContain("sales.projects.cancel");
    expect(sql).toContain("Debes indicar el motivo de cancelacion");
  });
});

describe("permisos y RLS", () => {
  it("declara los 11 permisos del namespace sales.projects", () => {
    for (const key of [
      "sales.projects.view",
      "sales.projects.create",
      "sales.projects.update",
      "sales.projects.convert_from_quotation",
      "sales.projects.manage_team",
      "sales.projects.manage_expenses",
      "sales.projects.manage_documents",
      "sales.projects.add_notes",
      "sales.projects.close",
      "sales.projects.reopen",
      "sales.projects.cancel",
    ]) {
      expect(sql).toContain(key);
    }
  });

  it("habilita RLS en todas las tablas nuevas", () => {
    expect(sql).toContain("alter table public.om_projects enable row level security");
    expect(sql).toContain(
      "alter table public.om_project_expenses enable row level security",
    );
    expect(sql).toContain(
      "alter table public.om_project_documents enable row level security",
    );
  });

  it("usa can_access_unit y has_permission, reutilizando el sistema existente", () => {
    expect(sql).toContain("public.can_access_unit(company_id,business_unit_id)");
    expect(sql).toContain("public.has_permission('sales.projects.view')");
  });

  it("registra auditoría reutilizando el trigger genérico existente", () => {
    expect(sql).toContain(
      "create trigger audit_om_projects after insert or update or delete on public.om_projects for each row execute function public.audit_row_change()",
    );
    expect(sql).not.toContain("create table public.om_project_audit");
  });
});

describe("edición de información general no borra datos ausentes del formulario", () => {
  it("protege client_company y client_rut con coalesce en vez de sobrescribir con null", () => {
    expect(sql).toContain(
      "client_company=coalesce(nullif(trim(payload->>'client_company'),''),client_company)",
    );
    expect(sql).toContain(
      "client_rut=coalesce(nullif(trim(payload->>'client_rut'),''),client_rut)",
    );
  });

  it("no permite que om_update_project toque client_contact/client_email/client_place", () => {
    const fn = sql.slice(
      sql.indexOf("function public.om_update_project"),
      sql.indexOf("function public.om_set_project_responsible"),
    );
    expect(fn).not.toContain("client_contact=");
    expect(fn).not.toContain("client_email=");
    expect(fn).not.toContain("client_place=");
  });
});

describe("listado de integrantes de la unidad para los selectores", () => {
  it("reutiliza el patron security definer de shares_business_unit en vez de exponer user_business_units", () => {
    expect(sql).toContain("public.om_list_unit_members");
    expect(sql).toContain("security definer");
    expect(sql).toContain("if not public.can_access_unit(target_company,target_unit) then raise exception");
  });
});

describe("almacenamiento privado de documentos", () => {
  it("crea un bucket privado con límite de 10MB y tipos permitidos", () => {
    expect(sql).toContain("'modular-project-attachments'");
    expect(sql).toContain("false,10485760");
    expect(sql).toContain(
      "array['application/pdf','image/jpeg','image/png']",
    );
  });

  it("restringe el acceso a los archivos vía políticas de storage", () => {
    expect(sql).toContain("storage_modular_project_expense_select");
    expect(sql).toContain("storage_modular_project_document_select");
    expect(sql).toContain("public.storage_company_id(name)");
  });

  it("califica storage.objects.name en los selects con join, para evitar 'column reference name is ambiguous'", () => {
    // om_project_documents.name colisiona con storage.objects.name en el
    // mismo subquery — sin calificar, Postgres rechaza la política con
    // 42702 (column reference "name" is ambiguous) al aplicar la migración.
    expect(sql).toContain("a.object_path=storage.objects.name");
    expect(sql).toContain("d.object_path=storage.objects.name");
    expect(sql).not.toContain("a.object_path=name");
    expect(sql).not.toContain("d.object_path=name");
  });
});
