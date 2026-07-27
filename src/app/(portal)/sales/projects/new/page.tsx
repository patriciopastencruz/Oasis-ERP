import { ProjectForm } from "@/components/sales/project-form";
import { PageHeader, Panel } from "@/components/ui/page";
import { Notice } from "@/modules/sales/ui";
import {
  createProjectAction,
  convertQuotationToProjectAction,
} from "@/modules/sales/projects/application/actions";
import {
  listUnitMembers,
  projectsContext,
} from "@/modules/sales/projects/application/queries";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ fromQuotation?: string; error?: string }>;
}) {
  const q = await searchParams;
  const permission = q.fromQuotation
    ? "sales.projects.convert_from_quotation"
    : "sales.projects.create";
  const { company, unit, supabase } = await projectsContext(permission);
  const members = await listUnitMembers(supabase, company.id, unit.id);

  let quotation:
    | {
        id: string;
        quotation_number: string | null;
        client_company: string;
        client_place: string | null;
        net: number;
        iva: number;
        total: number;
      }
    | undefined;
  let quotationError: string | null = null;

  if (q.fromQuotation) {
    const { data } = await supabase
      .from("om_quotations")
      .select(
        "id,quotation_number,client_company,client_place,status,net,iva,total",
      )
      .eq("id", q.fromQuotation)
      .eq("business_unit_id", unit.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) {
      quotationError = "No se encontró la cotización.";
    } else if (!["approved", "delivered"].includes(data.status)) {
      quotationError =
        "Solo se pueden convertir cotizaciones aprobadas o entregadas.";
    } else {
      const { data: existingProject } = await supabase
        .from("om_projects")
        .select("id")
        .eq("quotation_id", data.id)
        .maybeSingle();
      if (existingProject) {
        quotationError = "Esta cotización ya tiene un proyecto asociado.";
      } else {
        quotation = {
          id: data.id,
          quotation_number: data.quotation_number,
          client_company: data.client_company,
          client_place: data.client_place,
          net: Number(data.net),
          iva: Number(data.iva),
          total: Number(data.total),
        };
      }
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title={quotation ? "Convertir cotización en proyecto" : "Nuevo proyecto"}
        description={
          quotation
            ? "Los datos comerciales se copian desde la cotización y quedan fijos como fotografía del proyecto."
            : "Creación manual, como excepción, sin una cotización asociada."
        }
      />
      <Notice error={q.error ?? quotationError ?? undefined} />
      {!quotationError && (
        <Panel>
          <ProjectForm
            action={
              quotation ? convertQuotationToProjectAction : createProjectAction
            }
            submitLabel={quotation ? "Convertir en proyecto" : "Crear proyecto"}
            members={members}
            quotation={quotation}
          />
        </Panel>
      )}
    </>
  );
}
