import { PageHeader } from "@/components/ui/page";
import { RequestForm } from "@/components/supply/request-form";
import { santiagoToday } from "@/modules/lodging/domain/daily-closing";
import { Notice } from "@/modules/inventory/ui";
import { loadCatalog, loadMyProjects, SUPPLY_REQUEST, supplyContext } from "@/modules/inventory/supply/application/queries";
import { saveRequestAction } from "@/modules/inventory/supply/application/actions";
import { defaultCoverWindow } from "@/modules/inventory/supply/domain/supply";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const { supabase } = await supplyContext(SUPPLY_REQUEST);
  const [catalog, projects] = await Promise.all([loadCatalog(supabase), loadMyProjects(supabase)]);
  const today = santiagoToday();
  const window = defaultCoverWindow(today);

  return (
    <>
      <PageHeader eyebrow="Abastecimiento" title="Nuevo pedido de materiales" description="Pide lo que necesitas para armar en los próximos 2 días." />
      <Notice {...q} />
      {!projects.length ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          No tienes proyectos asignados. Pide a administración que te agregue al equipo de tu proyecto (pestaña «Equipo» del proyecto).
        </p>
      ) : (
        <RequestForm action={saveRequestAction} catalog={catalog} projects={projects} today={today} initial={{ from: window.from, to: window.to }} />
      )}
    </>
  );
}
