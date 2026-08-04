import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";

export async function tasksContext() {
  return requirePermission("tasks.board.view");
}

export async function listCompanyMembers(
  supabase: SupabaseClient,
  companyId: string,
) {
  const { data, error } = await supabase.rpc("tasks_list_company_members", {
    target_company: companyId,
  });
  if (error) {
    console.error("[tasks-members]", error.message);
    return [];
  }
  return (data ?? []) as { id: string; first_name: string; last_name: string }[];
}

export type BoardCard = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "done";
  due_date: string | null;
  sort_order: number;
  assignee: { id: string; first_name: string; last_name: string } | null;
};

export async function loadBoard(companyId: string): Promise<BoardCard[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("task_cards")
    .select(
      "id,title,description,status,due_date,sort_order,assignee:profiles!task_cards_assignee_id_fkey(id,first_name,last_name)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) console.error("[tasks-board]", error.message);
  return ((data ?? []) as unknown as Array<
    Omit<BoardCard, "assignee"> & {
      assignee: BoardCard["assignee"] | BoardCard["assignee"][];
    }
  >).map((row) => ({
    ...row,
    assignee: Array.isArray(row.assignee)
      ? (row.assignee[0] ?? null)
      : row.assignee,
  }));
}
