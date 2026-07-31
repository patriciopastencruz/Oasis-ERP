import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
import { salesContext } from "@/modules/sales/quotations/application/queries";
import type {
  ProjectExpenseCategory,
  ProjectExpenseDocumentType,
  ProjectMemberRole,
  ProjectStatus,
} from "@/modules/sales/projects/domain/project";

/** Mismo contexto de autenticación/unidad que usa Cotizaciones — no se duplica. */
export const projectsContext = salesContext;

/**
 * Para el listado y las acciones, exigir `sales.projects.view` (u otro
 * permiso específico) está bien. Pero la política RLS `om_projects_read`
 * también deja ver un proyecto puntual a su responsable o a quien lo
 * creó, aunque no tengan ese permiso general — así que la ficha
 * individual (`/sales/projects/[id]`) no debe exigirlo de entrada, o
 * bloquearía a ese mismo responsable con un redirect a /no-access antes
 * de llegar a la comprobación (más fina) que ya hace RLS al cargar el
 * proyecto. Aquí solo se exige sesión + unidad OM; si el proyecto
 * cargado resulta null, la página trata eso como "no encontrado" (no
 * hay forma de distinguir "no existe" de "no autorizado" bajo RLS, y es
 * el mismo criterio que ya usa el detalle de Cotizaciones).
 */
export async function projectDetailContext() {
  const ctx = await requireSession();
  const unit = ctx.units.find((u) => u.code === "OM");
  if (!unit) redirect("/no-access");
  const company = ctx.companies.find((c) => c.id === unit.company_id);
  if (!company) redirect("/no-access");
  return { ctx, unit, company, supabase: await createSupabaseServerClient() };
}

type PersonRef = {
  id?: string;
  first_name?: string;
  last_name?: string;
} | null;

// Nota sobre los `as unknown as`: el cliente de Supabase de este repo no
// registra un tipo `Database`, así que el parser de tipos de
// select-strings con alias (`alias:tabla!fk(...)`) devuelve
// `GenericStringError` en vez de inferir la forma real — el mismo motivo
// por el que `sales/quotations/page.tsx` usa `any` en sus mapeos. Acá se
// tipa explícitamente una sola vez por consulta en lugar de repetir
// `any` en cada página que la consume.

export type ProjectListFilters = {
  search?: string;
  status?: string;
  responsible?: string;
  order?: "recent" | "oldest";
};

export type ProjectListRow = {
  id: string;
  project_number: string | null;
  name: string;
  status: ProjectStatus;
  client_company: string;
  quotation_id: string | null;
  net_income: number;
  estimated_start_date: string | null;
  actual_start_date: string | null;
  estimated_end_date: string | null;
  updated_at: string;
  responsible: PersonRef;
  quotation: { quotation_number: string | null } | null;
};

const PROJECT_LIST_SELECT =
  "id,project_number,name,status,client_company,quotation_id,net_income,estimated_start_date,actual_start_date,estimated_end_date,updated_at," +
  "responsible:profiles!om_projects_responsible_id_fkey(id,first_name,last_name)," +
  "quotation:om_quotations!om_projects_quotation_id_fkey(quotation_number)";

export async function listProjects(
  supabase: SupabaseClient,
  companyId: string,
  unitId: string,
  filters: ProjectListFilters,
): Promise<ProjectListRow[]> {
  let query = supabase
    .from("om_projects")
    .select(PROJECT_LIST_SELECT)
    .eq("company_id", companyId)
    .eq("business_unit_id", unitId)
    .is("deleted_at", null);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.responsible)
    query = query.eq("responsible_id", filters.responsible);
  if (filters.search) {
    const term = filters.search.replace(/[,()]/g, " ").trim();
    query = query.or(
      `name.ilike.%${term}%,project_number.ilike.%${term}%,client_company.ilike.%${term}%`,
    );
  }
  query = query.order("updated_at", {
    ascending: filters.order === "oldest",
  });

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as unknown as ProjectListRow[];
}

export async function projectExpenseTotals(
  supabase: SupabaseClient,
  projectId: string,
) {
  const { data } = await supabase
    .from("om_project_expenses")
    .select("net_amount,iva_amount,total_amount")
    .eq("project_id", projectId)
    .eq("status", "active");
  const rows = (data ?? []) as {
    net_amount: number;
    iva_amount: number;
    total_amount: number;
  }[];
  return rows.reduce(
    (acc, row) => ({
      net: acc.net + Number(row.net_amount),
      iva: acc.iva + Number(row.iva_amount),
      total: acc.total + Number(row.total_amount),
    }),
    { net: 0, iva: 0, total: 0 },
  );
}

export type ProjectDetail = {
  id: string;
  company_id: string;
  business_unit_id: string;
  project_number: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  quotation_id: string | null;
  client_company: string;
  client_rut: string | null;
  client_contact: string | null;
  client_email: string | null;
  client_place: string | null;
  execution_address: string | null;
  net_income: number;
  iva_reference: number;
  total_commercial: number;
  estimated_start_date: string | null;
  actual_start_date: string | null;
  estimated_end_date: string | null;
  actual_end_date: string | null;
  closed_at: string | null;
  closure_notes: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  responsible_id: string;
  responsible: PersonRef;
  seller: PersonRef;
  creator: PersonRef;
  closer: PersonRef;
  quotation: {
    id: string;
    quotation_number: string | null;
    status: string;
  } | null;
};

const PROJECT_DETAIL_SELECT =
  "*,responsible:profiles!om_projects_responsible_id_fkey(id,first_name,last_name)," +
  "seller:profiles!om_projects_seller_id_fkey(first_name,last_name)," +
  "creator:profiles!om_projects_created_by_fkey(first_name,last_name)," +
  "closer:profiles!om_projects_closed_by_fkey(first_name,last_name)," +
  "quotation:om_quotations!om_projects_quotation_id_fkey(id,quotation_number,status)";

export async function loadProject(
  supabase: SupabaseClient,
  id: string,
): Promise<ProjectDetail | null> {
  const { data } = await supabase
    .from("om_projects")
    .select(PROJECT_DETAIL_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data as unknown as ProjectDetail | null;
}

export type ProjectExpenseRow = {
  id: string;
  expense_date: string;
  category: ProjectExpenseCategory;
  description: string;
  supplier_name: string | null;
  supplier_rut: string | null;
  document_type: ProjectExpenseDocumentType;
  document_number: string | null;
  is_exempt: boolean;
  net_amount: number;
  iva_amount: number;
  total_amount: number;
  payment_method: string | null;
  notes: string | null;
  status: "active" | "voided";
  void_reason: string | null;
  created_at: string;
};

export async function loadProjectExpenses(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectExpenseRow[]> {
  const { data } = await supabase
    .from("om_project_expenses")
    .select(
      "id,expense_date,category,description,supplier_name,supplier_rut,document_type,document_number,is_exempt,net_amount,iva_amount,total_amount,payment_method,notes,status,void_reason,created_at",
    )
    .eq("project_id", projectId)
    .order("expense_date", { ascending: false });
  return (data ?? []) as unknown as ProjectExpenseRow[];
}

export type ExpenseAttachmentRow = {
  id: string;
  expense_id: string;
  object_path: string;
  original_name: string;
  mime_type: string;
  created_at: string;
};

export async function loadExpenseAttachments(
  supabase: SupabaseClient,
  expenseIds: string[],
): Promise<ExpenseAttachmentRow[]> {
  if (expenseIds.length === 0) return [];
  const { data } = await supabase
    .from("om_project_expense_attachments")
    .select("id,expense_id,object_path,original_name,mime_type,created_at")
    .in("expense_id", expenseIds);
  return (data ?? []) as unknown as ExpenseAttachmentRow[];
}

export type ProjectMemberRow = {
  id: string;
  member_type: "user" | "external";
  role: ProjectMemberRole;
  external_name: string | null;
  note: string | null;
  created_at: string;
  profile: PersonRef;
};

export async function loadProjectMembers(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectMemberRow[]> {
  const { data } = await supabase
    .from("om_project_members")
    .select(
      "id,member_type,role,external_name,note,created_at,profile:profiles!om_project_members_profile_id_fkey(id,first_name,last_name)",
    )
    .eq("project_id", projectId)
    .order("created_at");
  return (data ?? []) as unknown as ProjectMemberRow[];
}

export type ProjectDocumentRow = {
  id: string;
  document_type: string;
  name: string;
  object_path: string;
  mime_type: string;
  description: string | null;
  created_at: string;
  uploader: PersonRef;
};

export async function loadProjectDocuments(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectDocumentRow[]> {
  const { data } = await supabase
    .from("om_project_documents")
    .select(
      "id,document_type,name,object_path,mime_type,description,created_at,uploader:profiles!om_project_documents_uploaded_by_fkey(first_name,last_name)",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as ProjectDocumentRow[];
}

export type ProjectContractRow = {
  id: string;
  contract_number: string | null;
  contract_city: string;
  contract_date: string;
  activities: string;
  payment_terms: string;
  pdf_object_path: string | null;
  pdf_generated_at: string | null;
  created_at: string;
};

export async function loadProjectContracts(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectContractRow[]> {
  const { data } = await supabase
    .from("om_project_contracts")
    .select(
      "id,contract_number,contract_city,contract_date,activities,payment_terms,pdf_object_path,pdf_generated_at,created_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as ProjectContractRow[];
}

export type ProjectNoteRow = {
  id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author: PersonRef;
};

export async function loadProjectNotes(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectNoteRow[]> {
  const { data } = await supabase
    .from("om_project_notes")
    .select(
      "id,body,created_at,edited_at,deleted_at,author:profiles!om_project_notes_created_by_fkey(id,first_name,last_name)",
    )
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as ProjectNoteRow[];
}

export type ProjectStatusHistoryRow = {
  id: string;
  from_status: ProjectStatus | null;
  to_status: ProjectStatus;
  comment: string | null;
  changed_at: string;
  changer: PersonRef;
};

export async function loadProjectStatusHistory(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectStatusHistoryRow[]> {
  const { data } = await supabase
    .from("om_project_status_history")
    .select(
      "id,from_status,to_status,comment,changed_at,changer:profiles!om_project_status_history_changed_by_fkey(first_name,last_name)",
    )
    .eq("project_id", projectId)
    .order("changed_at", { ascending: false });
  return (data ?? []) as unknown as ProjectStatusHistoryRow[];
}

export async function listUnitMembers(
  supabase: SupabaseClient,
  companyId: string,
  unitId: string,
) {
  const { data } = await supabase.rpc("om_list_unit_members", {
    target_company: companyId,
    target_unit: unitId,
  });
  return (data ?? []) as {
    id: string;
    first_name: string;
    last_name: string;
  }[];
}

export async function signProjectAttachment(
  supabase: SupabaseClient,
  objectPath: string,
  downloadName: string,
) {
  const { data } = await supabase.storage
    .from("modular-project-attachments")
    .createSignedUrl(objectPath, 300, { download: downloadName });
  return data?.signedUrl ?? null;
}
