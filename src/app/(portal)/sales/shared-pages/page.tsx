import { headers } from "next/headers";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { CopyLinkButton } from "@/components/sales/copy-link-button";
import { PageHeader, Panel } from "@/components/ui/page";
import { surveyBaseUrl } from "@/modules/lodging/application/survey-links";
import { salesContext } from "@/modules/sales/quotations/application/queries";
import {
  createSharedPageAction,
  deleteSharedPageAction,
  replaceSharedPageFileAction,
  toggleSharedPageAction,
} from "@/modules/sales/shared-pages/application/actions";
import { SHARED_PAGE_MAX_BYTES, sharedPageUrl } from "@/modules/sales/shared-pages/domain/shared-pages";
import { Notice, QuotationTabs, inputClass } from "@/modules/sales/ui";

const dateTime = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function SharedPages({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await salesContext("sales.quotations.create");
  const base = surveyBaseUrl(await headers());
  const { data: pages } = await supabase
    .from("om_shared_pages")
    .select("id,title,slug,source_url,active,html_bytes,content_version,created_at,updated_at")
    .eq("business_unit_id", unit.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title="Páginas compartidas"
        description="Sube el archivo .html de una página (por ejemplo, un visor 3D hecho con Claude) y el ERP la publica con un enlace de oasis-erp.cl para compartir sin que la persona inicie sesión."
      />
      <QuotationTabs canApprove={ctx.permissions.has("sales.quotations.approve")} />
      <Notice success={q.success} error={q.error} />

      <Panel className="mb-6">
        <h2 className="text-base font-semibold">Nueva página</h2>
        <form action={createSharedPageAction} encType="multipart/form-data" className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium">
            Título
            <input name="title" required minLength={2} maxLength={120} placeholder="Casa modular 36 m²" className={inputClass} />
          </label>
          <label className="text-sm font-medium">
            Nombre del enlace <span className="font-normal text-slate-500">(opcional)</span>
            <input name="slug" maxLength={60} placeholder="casa-modular-36m2" className={inputClass} />
          </label>
          <label className="text-sm font-medium">
            Archivo .html
            <input name="file" type="file" accept=".html,.htm,text/html" required className={inputClass} />
          </label>
          <label className="text-sm font-medium">
            Link de Claude de origen <span className="font-normal text-slate-500">(opcional, solo como referencia)</span>
            <input name="source_url" type="url" maxLength={500} placeholder="https://claude.ai/artifact/…" className={inputClass} />
          </label>
          <p className="text-xs text-slate-500 md:col-span-2">
            Máximo {SHARED_PAGE_MAX_BYTES / 1_000_000} MB. Si no escribes nombre de enlace, se arma con el título. La página se muestra
            aislada del ERP, sin acceso a la sesión de nadie. Para pedirle a Claude el archivo, escríbele «dame el .html de este
            artifact».
          </p>
          <div className="md:col-span-2">
            <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white">Publicar página</button>
          </div>
        </form>
      </Panel>

      <div className="space-y-3">
        {(pages ?? []).map((p) => {
          const url = sharedPageUrl(base, p.slug);
          return (
            <Panel key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold">
                    {p.title}{" "}
                    <span
                      className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${p.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                    >
                      {p.active ? "Activa" : "Desactivada"}
                    </span>
                  </h3>
                  <a href={url} target="_blank" rel="noreferrer" className="break-all text-sm text-[var(--oasis-primary)] underline">
                    {url}
                  </a>
                  <p className="mt-1 text-xs text-slate-500">
                    {Math.round(p.html_bytes / 1024)} KB · versión {p.content_version} · actualizada {dateTime.format(new Date(p.updated_at))}
                    {p.source_url && (
                      <>
                        {" · "}
                        <a href={p.source_url} target="_blank" rel="noreferrer" className="underline">
                          origen en Claude
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <CopyLinkButton url={url} />
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
                <form action={replaceSharedPageFileAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="page_id" value={p.id} />
                  <label className="text-xs font-medium">
                    Reemplazar archivo
                    <input name="file" type="file" accept=".html,.htm,text/html" required className="mt-1 block text-xs" />
                  </label>
                  <button className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:border-[var(--oasis-primary)]">Actualizar</button>
                </form>
                <form action={toggleSharedPageAction}>
                  <input type="hidden" name="page_id" value={p.id} />
                  <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                  <button className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:border-[var(--oasis-primary)]">
                    {p.active ? "Desactivar" : "Activar"}
                  </button>
                </form>
                <form action={deleteSharedPageAction}>
                  <input type="hidden" name="page_id" value={p.id} />
                  <ConfirmButton
                    message="¿Eliminar esta página? El enlace dejará de funcionar y no se podrá reutilizar."
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Eliminar
                  </ConfirmButton>
                </form>
              </div>
            </Panel>
          );
        })}
        {(pages ?? []).length === 0 && (
          <Panel>
            <p className="text-sm text-slate-600">Todavía no hay páginas compartidas.</p>
          </Panel>
        )}
      </div>
    </>
  );
}
