import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// La fase E quedó en dos migraciones: la base y sus correcciones (las funciones vigentes son las de la segunda).
const base = readFileSync(resolve(process.cwd(), "supabase/migrations/20260928021646_lodging_incidents_maintenance.sql"), "utf8");
const fixes = readFileSync(resolve(process.cwd(), "supabase/migrations/20260928115504_lodging_incidents_fixes.sql"), "utf8");
const sql = fixes + base;
const fn = (name: string) => sql.split(`function public.${name}(`)[1]?.split("end $$;")[0] ?? "";

describe("incidencias y mantención: esquema", () => {
  it("bloquear por mantención exige inspección o gestión; fuera de servicio solo gestión", () => {
    const report = fn("lodging_incident_report");
    expect(report).toContain("v_block='maintenance' and not (public.has_permission('lodging.rooms.inspect') or public.has_permission('lodging.maintenance.manage'))");
    expect(report).toContain("v_block='out_of_service' and not public.has_permission('lodging.maintenance.manage')");
    expect(report).toContain("not public.can_access_unit(unit.company_id,unit.id)");
  });

  it("liberar solo si no queda otra incidencia bloqueante y nunca directo a disponible", () => {
    const release = fn("lodging_incident_release_room");
    expect(release).toContain("room_released_at is null and id<>v_incident.id");
    // El trigger de sincronización convierte 'available' tras mantención en pending_inspection.
    expect(release).toContain("status in('maintenance','out_of_service')");
    expect(release).toContain("case when count(*)=0 then null");
  });

  it("gestión exige permiso, notas al resolver y motivo al cancelar", () => {
    const update = fn("lodging_incident_update");
    expect(update).toContain("public.has_permission('lodging.maintenance.manage')");
    expect(update).toContain("'Indica como se resolvio'");
    expect(update).toContain("'Indica el motivo'");
  });

  it("fotos en bucket privado con ruta empresa/unidad/incidencia y máximo 5", () => {
    expect(sql).toContain("values('lodging-operations','lodging-operations',false,10485760,array['image/jpeg','image/png','image/webp'])");
    expect(fn("lodging_incident_attach")).toContain("v_inc.company_id::text||'/'||v_inc.business_unit_id::text||'/'||v_inc.id::text||'/%'");
    expect(fn("lodging_incident_attach")).toContain("'Maximo 5 fotos por incidencia'");
    // Las políticas de Storage no dependen del RLS de lodging_incidents (aseo no puede listarlas).
    expect(fixes).toContain("with check (bucket_id='lodging-operations' and public.lodging_incident_storage_access(name,true))");
  });

  it("tablas solo de lectura con RLS por unidad", () => {
    expect(sql).toContain("alter table public.lodging_incident_attachments enable row level security");
    expect(sql).toContain("grant select on public.lodging_incident_attachments to authenticated");
    expect(sql).not.toMatch(/grant (insert|update|delete)/);
  });
});
