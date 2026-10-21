import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadHostels, luciaContext } from "@/modules/lucia/application/queries";
import { removeRoomPhotoAction, uploadRoomPhotosAction } from "@/modules/lucia/application/actions";
import { LuciaTabs, Notice, inputClass } from "@/modules/lucia/ui";

export default async function LuciaPhotosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, supabase } = await luciaContext("lucia.settings.manage");
  const hostels = await loadHostels(supabase);
  const unitIds = hostels.map((h) => h.business_unit_id);
  const [{ data: rooms }, { data: photos }] = await Promise.all([
    supabase.from("lodging_rooms").select("business_unit_id,room_type").in("business_unit_id", unitIds).eq("active", true),
    supabase
      .from("lucia_room_photos")
      .select("id,business_unit_id,room_type,object_path,sort_order")
      .is("deleted_at", null)
      .order("room_type")
      .order("sort_order"),
  ]);
  // Bucket privado: miniaturas con enlaces firmados de 1 hora (ya se validó el permiso).
  const paths = (photos ?? []).map((p) => p.object_path);
  const { data: signed } = paths.length
    ? await createSupabaseAdminClient().storage.from("lucia-photos").createSignedUrls(paths, 3600)
    : { data: [] };
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <>
      <PageHeader
        eyebrow="Hostales · Lucía"
        title="Fotos de las habitaciones"
        description="Cuando un cliente pide fotos, Lucía le envía hasta 3 del tipo de habitación que le interesa, sin repetir las que ya envió. El link del álbum completo de cada hostal se configura en Configuración y se envía al confirmar la reserva."
      />
      <LuciaTabs active="fotos" permissions={ctx.permissions} />
      <Notice success={q.success} error={q.error} />
      <div className="space-y-4">
        {hostels.map((h) => {
          const types = [...new Set((rooms ?? []).filter((r) => r.business_unit_id === h.business_unit_id).map((r) => r.room_type as string))].sort();
          const hostelPhotos = (photos ?? []).filter((p) => p.business_unit_id === h.business_unit_id);
          return (
            <Panel key={h.business_unit_id}>
              <h2 className="mb-3 font-semibold">{h.display_name}</h2>
              {types.length === 0 ? (
                <p className="text-sm text-slate-500">Esta hostal no tiene habitaciones activas.</p>
              ) : (
                <div className="space-y-4">
                  {types.map((type) => {
                    const list = hostelPhotos.filter((p) => p.room_type === type);
                    return (
                      <div key={type}>
                        <p className="mb-2 text-sm font-semibold">{type} <span className="font-normal text-slate-500">({list.length}/6)</span></p>
                        <div className="flex flex-wrap gap-2">
                          {list.map((p) => (
                            <div key={p.id} className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado temporal del bucket privado */}
                              <img src={urlOf.get(p.object_path) ?? ""} alt={type} className="h-24 w-32 rounded-lg border object-cover" />
                              <form action={removeRoomPhotoAction} className="absolute right-1 top-1">
                                <input type="hidden" name="id" value={p.id} />
                                <button className="rounded-md bg-white/90 px-1.5 text-xs font-semibold text-red-700 shadow" aria-label="Eliminar foto">✕</button>
                              </form>
                            </div>
                          ))}
                          {list.length === 0 && <p className="text-xs text-slate-500">Sin fotos: Lucía describirá la habitación si se las piden.</p>}
                        </div>
                      </div>
                    );
                  })}
                  <form action={uploadRoomPhotosAction} className="grid gap-2 border-t pt-3 md:grid-cols-[1fr_1fr_auto]">
                    <input type="hidden" name="business_unit_id" value={h.business_unit_id} />
                    <select name="room_type" required defaultValue="" className={inputClass}>
                      <option value="" disabled>Tipo de habitación</option>
                      {types.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple required className={`${inputClass} py-2`} />
                    <button className="mt-1.5 rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white">Subir fotos</button>
                    <p className="text-xs text-slate-500 md:col-span-3">JPG, PNG o WEBP; hasta 4 MB en total por carga y 6 fotos por tipo de habitación.</p>
                  </form>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </>
  );
}
