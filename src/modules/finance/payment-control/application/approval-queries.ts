import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function approvableSteps() {
  const s = await createSupabaseServerClient();
  const { data } = await s
    .from("payment_request_approval_steps")
    .select(
      "id,payment_request_id,approval_instance_id,step_name_snapshot,sequence_order,parallel_group,execution_mode,require_comment,require_additional_attachment,allow_higher_role_substitution,status,roles!payment_request_approval_steps_required_role_id_fkey(name),payment_requests!inner(id,company_id,business_unit_id,request_number,supplier_legal_name,amount,priority,status,created_at,updated_at,requested_payment_date,requester_id,business_units(name,companies(trade_name)),profiles!payment_requests_requester_id_fkey(first_name,last_name)),payment_request_approval_instances!inner(revision,workflow_name_snapshot,status)",
    )
    .eq("status", "pending")
    .eq("payment_request_approval_instances.status", "pending");
  if (!data) return [];
  const allowed = await Promise.all(
    data.map(async (row) => ({
      row,
      allowed:
        (await s.rpc("can_approve_workflow_step", { target_step: row.id }))
          .data === true,
    })),
  );
  return allowed.filter((x) => x.allowed).map((x) => x.row);
}
