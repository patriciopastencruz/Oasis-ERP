"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { createUserSchema, type UserActionResult } from "./user-schema";

const text = z.string().trim().min(1).max(160);
const uuid = z.string().uuid();
const email = z.string().trim().email();
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/);
function values(form: FormData, key: string) {
  return form.getAll(key).map(String).filter(Boolean);
}
function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
async function audit(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  actor: string,
  action: string,
  type: string,
  id: string | null,
  oldData: unknown,
  newData: unknown,
  companyId?: string,
) {
  await admin.from("audit_logs").insert({
    actor_id: actor,
    action,
    entity_type: type,
    entity_id: id,
    old_data: oldData,
    new_data: newData,
    company_id: companyId ?? null,
  });
}

const userSchema = createUserSchema.extend({ id: uuid.optional() });
async function validateAssignments(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companies: string[],
  units: string[],
) {
  const { data } = await admin
    .from("business_units")
    .select("id,company_id")
    .in("id", units);
  if (
    !data ||
    data.length !== units.length ||
    data.some((u) => !companies.includes(u.company_id))
  )
    throw new Error("Cada unidad debe pertenecer a una empresa asignada");
}

export async function createUserAction(
  _previous: UserActionResult,
  form: FormData,
): Promise<UserActionResult> {
  const actor = await requirePermission("administration.users.manage");
  const admin = createSupabaseAdminClient();
  const parsed = createUserSchema.safeParse({
    ...Object.fromEntries(form),
    company_ids: values(form, "company_ids"),
    unit_ids: values(form, "unit_ids"),
  });
  if (!parsed.success)
    return {
      success: false,
      message: "Revisa las asignaciones obligatorias.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  const v = parsed.data;
  try {
    await validateAssignments(admin, v.company_ids, v.unit_ids);
  } catch (e) {
    return {
      success: false,
      message: (e as Error).message,
      fieldErrors: { unit_ids: [(e as Error).message] },
    };
  }
  const { data, error } = await admin.auth.admin.inviteUserByEmail(v.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/update-password`,
  });
  if (error || !data.user)
    return {
      success: false,
      message:
        "No fue posible enviar la invitación. Verifica que el correo no esté registrado.",
    };
  const id = data.user.id;
  const { error: profileError } = await admin.from("profiles").insert({
    id,
    role_id: v.role_id,
    first_name: v.first_name,
    last_name: v.last_name,
    email: v.email,
    phone: v.phone || null,
    job_title: v.job_title,
    created_by: actor.user.id,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(id);
    return {
      success: false,
      message: "No fue posible crear el perfil; la invitación fue revertida.",
    };
  }
  const companyRows = v.company_ids.map((company_id) => ({
    user_id: id,
    company_id,
    created_by: actor.user.id,
  }));
  const { error: companyError } = await admin
    .from("user_companies")
    .insert(companyRows);
  if (companyError) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
    return {
      success: false,
      message:
        "No fue posible asignar las empresas; la creación fue revertida.",
      fieldErrors: { company_ids: ["Revisa las empresas seleccionadas."] },
    };
  }
  const unitData = await admin
    .from("business_units")
    .select("id,company_id")
    .in("id", v.unit_ids);
  const { error: unitError } = await admin.from("user_business_units").insert(
    (unitData.data ?? []).map((u) => ({
      user_id: id,
      company_id: u.company_id,
      business_unit_id: u.id,
      created_by: actor.user.id,
    })),
  );
  if (unitError) {
    await admin.from("user_companies").delete().eq("user_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
    return {
      success: false,
      message:
        "No fue posible asignar las unidades; la creación fue revertida.",
      fieldErrors: { unit_ids: ["Revisa las unidades seleccionadas."] },
    };
  }
  await audit(admin, actor.user.id, "invite", "profiles", id, null, v);
  revalidatePath("/admin/users");
  return { success: true, message: "Usuario invitado correctamente." };
}

export async function updateUserAction(form: FormData) {
  const actor = await requirePermission("administration.users.manage");
  const admin = createSupabaseAdminClient();
  const parsed = userSchema.safeParse({
    ...Object.fromEntries(form),
    company_ids: values(form, "company_ids"),
    unit_ids: values(form, "unit_ids"),
  });
  if (!parsed.success) fail("/admin/users", parsed.error.issues[0].message);
  const v = parsed.data;
  if (!v.id) fail("/admin/users", "Usuario inválido");
  try {
    await validateAssignments(admin, v.company_ids, v.unit_ids);
  } catch (e) {
    fail("/admin/users", (e as Error).message);
  }
  const { data: old } = await admin
    .from("profiles")
    .select("*")
    .eq("id", v.id)
    .single();
  await admin
    .from("profiles")
    .update({
      first_name: v.first_name,
      last_name: v.last_name,
      phone: v.phone || null,
      job_title: v.job_title,
      role_id: v.role_id,
    })
    .eq("id", v.id);
  await admin.from("user_business_units").delete().eq("user_id", v.id);
  await admin.from("user_companies").delete().eq("user_id", v.id);
  await admin.from("user_companies").insert(
    v.company_ids.map((company_id) => ({
      user_id: v.id!,
      company_id,
      created_by: actor.user.id,
    })),
  );
  const unitData = await admin
    .from("business_units")
    .select("id,company_id")
    .in("id", v.unit_ids);
  await admin.from("user_business_units").insert(
    (unitData.data ?? []).map((u) => ({
      user_id: v.id!,
      company_id: u.company_id,
      business_unit_id: u.id,
      created_by: actor.user.id,
    })),
  );
  await audit(admin, actor.user.id, "update", "profiles", v.id, old, v);
  revalidatePath("/admin/users");
  redirect("/admin/users?success=Usuario actualizado");
}

export async function toggleUserAction(form: FormData) {
  const actor = await requirePermission("administration.users.manage");
  const admin = createSupabaseAdminClient();
  const id = uuid.parse(form.get("id"));
  const active = form.get("active") === "true";
  if (!active) {
    const { data: target } = await admin
      .from("profiles")
      .select("role_id,roles(key)")
      .eq("id", id)
      .single();
    const role = Array.isArray(target?.roles) ? target.roles[0] : target?.roles;
    if (role?.key === "superadmin") {
      const { count } = await admin
        .from("profiles")
        .select("id,roles!inner(key)", { count: "exact", head: true })
        .eq("active", true)
        .eq("roles.key", "superadmin");
      if ((count ?? 0) <= 1)
        fail(
          "/admin/users",
          "No se puede desactivar al único Superadministrador activo",
        );
    }
  }
  await admin.from("profiles").update({ active }).eq("id", id);
  await audit(
    admin,
    actor.user.id,
    active ? "activate" : "deactivate",
    "profiles",
    id,
    null,
    { active },
  );
  revalidatePath("/admin/users");
}
export async function sendRecoveryAction(form: FormData) {
  await requirePermission("administration.users.manage");
  const admin = createSupabaseAdminClient();
  const target = email.parse(form.get("email"));
  await admin.auth.resetPasswordForEmail(target, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/update-password`,
  });
  redirect("/admin/users?success=Recuperación enviada");
}
export async function resendInvitationAction(form: FormData) {
  await requirePermission("administration.users.manage");
  const admin = createSupabaseAdminClient();
  const target = email.parse(form.get("email"));
  const { error } = await admin.auth.admin.inviteUserByEmail(target, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/update-password`,
  });
  if (error) fail("/admin/users", error.message);
  redirect("/admin/users?success=Invitación reenviada");
}

const roleSchema = z.object({
  id: uuid.optional(),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_.-]+$/),
  name: text,
  description: z.string().trim().max(500).optional(),
  permission_ids: z.array(uuid),
});
export async function saveRoleAction(form: FormData) {
  const actor = await requirePermission("administration.roles.manage");
  const admin = createSupabaseAdminClient();
  const parsed = roleSchema.safeParse({
    ...Object.fromEntries(form),
    permission_ids: values(form, "permission_ids"),
  });
  if (!parsed.success) fail("/admin/roles", parsed.error.issues[0].message);
  const v = parsed.data;
  let id = v.id;
  if (id) {
    const { data: old } = await admin
      .from("roles")
      .select("*")
      .eq("id", id)
      .single();
    if (old?.is_system && old.key !== v.key)
      fail("/admin/roles", "La key de un rol base es inmutable");
    await admin
      .from("roles")
      .update({ name: v.name, description: v.description || null })
      .eq("id", id);
    await admin.from("role_permissions").delete().eq("role_id", id);
    await audit(admin, actor.user.id, "update", "roles", id, old, v);
  } else {
    const { data, error } = await admin
      .from("roles")
      .insert({
        key: v.key,
        name: v.name,
        description: v.description || null,
        created_by: actor.user.id,
      })
      .select("id")
      .single();
    if (error) fail("/admin/roles", error.message);
    id = data.id;
    await audit(admin, actor.user.id, "create", "roles", id ?? null, null, v);
  }
  if (!id) fail("/admin/roles", "No se obtuvo el identificador del rol");
  if (v.permission_ids.length)
    await admin.from("role_permissions").insert(
      v.permission_ids.map((permission_id) => ({
        role_id: id,
        permission_id,
        created_by: actor.user.id,
      })),
    );
  revalidatePath("/admin/roles");
  redirect("/admin/roles?success=Rol guardado");
}
export async function duplicateRoleAction(form: FormData) {
  const actor = await requirePermission("administration.roles.manage");
  const admin = createSupabaseAdminClient();
  const source = uuid.parse(form.get("id"));
  const key = z
    .string()
    .regex(/^[a-z][a-z0-9_.-]+$/)
    .parse(form.get("key"));
  const { data: r } = await admin
    .from("roles")
    .select("name,description,role_permissions(permission_id)")
    .eq("id", source)
    .single();
  if (!r) fail("/admin/roles", "Rol no encontrado");
  const { data: newRole, error } = await admin
    .from("roles")
    .insert({
      key,
      name: `Copia de ${r.name}`,
      description: r.description,
      created_by: actor.user.id,
    })
    .select("id")
    .single();
  if (error) fail("/admin/roles", error.message);
  if (r.role_permissions.length)
    await admin.from("role_permissions").insert(
      r.role_permissions.map((p) => ({
        role_id: newRole.id,
        permission_id: p.permission_id,
        created_by: actor.user.id,
      })),
    );
  await audit(admin, actor.user.id, "duplicate", "roles", newRole.id, null, {
    source,
  });
  revalidatePath("/admin/roles");
}
export async function toggleRoleAction(form: FormData) {
  await requirePermission("administration.roles.manage");
  const admin = createSupabaseAdminClient();
  const id = uuid.parse(form.get("id"));
  const active = form.get("active") === "true";
  if (!active) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role_id", id)
      .eq("active", true);
    if ((count ?? 0) > 0)
      fail(
        "/admin/roles",
        "Reasigna los usuarios activos antes de desactivar el rol",
      );
  }
  await admin.from("roles").update({ active }).eq("id", id);
  revalidatePath("/admin/roles");
}

const companySchema = z.object({
  id: uuid.optional(),
  code,
  legal_name: text,
  trade_name: text,
  rut: text,
  timezone: z.string().default("America/Santiago"),
  currency: z.literal("CLP"),
  bank_name: text,
  bank_account_type: z.enum(["checking", "sight", "savings", "rut", "other"]),
  bank_account_number: z.string().trim().min(3).max(80),
  bank_account_holder_name: text,
  bank_account_holder_rut: text,
  bank_receipt_email: email,
});
export async function saveCompanyAction(form: FormData) {
  const actor = await requirePermission("administration.companies.manage");
  const admin = createSupabaseAdminClient();
  const v = companySchema.parse(Object.fromEntries(form));
  let id = v.id;
  if (id) {
    await admin
      .from("companies")
      .update({
        code: v.code,
        legal_name: v.legal_name,
        trade_name: v.trade_name,
        rut: v.rut,
        bank_name: v.bank_name,
        bank_account_type: v.bank_account_type,
        bank_account_number: v.bank_account_number,
        bank_account_holder_name: v.bank_account_holder_name,
        bank_account_holder_rut: v.bank_account_holder_rut,
        bank_receipt_email: v.bank_receipt_email,
      })
      .eq("id", id);
  } else {
    const { data, error } = await admin
      .from("companies")
      .insert({
        code: v.code,
        legal_name: v.legal_name,
        trade_name: v.trade_name,
        rut: v.rut,
        bank_name: v.bank_name,
        bank_account_type: v.bank_account_type,
        bank_account_number: v.bank_account_number,
        bank_account_holder_name: v.bank_account_holder_name,
        bank_account_holder_rut: v.bank_account_holder_rut,
        bank_receipt_email: v.bank_receipt_email,
        created_by: actor.user.id,
      })
      .select("id")
      .single();
    if (error) fail("/admin/companies", error.message);
    id = data.id;
  }
  await admin.from("app_settings").upsert(
    [
      {
        scope: "company",
        company_id: id,
        key: "timezone",
        value: v.timezone,
        created_by: actor.user.id,
      },
      {
        scope: "company",
        company_id: id,
        key: "currency",
        value: v.currency,
        created_by: actor.user.id,
      },
    ],
    { onConflict: "company_id,key" },
  );
  revalidatePath("/admin/companies");
  redirect("/admin/companies?success=Empresa guardada");
}
export async function toggleCompanyAction(form: FormData) {
  await requirePermission("administration.companies.manage");
  const admin = createSupabaseAdminClient();
  const id = uuid.parse(form.get("id"));
  const active = form.get("active") === "true";
  if (!active && form.get("confirm") !== "true") {
    const { count } = await admin
      .from("payment_requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", id)
      .in("status", [
        "pending_approval",
        "under_review",
        "approved",
        "scheduled",
      ]);
    if ((count ?? 0) > 0)
      fail(
        "/admin/companies",
        "La empresa tiene operaciones activas; confirma la desactivación",
      );
  }
  await admin.from("companies").update({ active }).eq("id", id);
  revalidatePath("/admin/companies");
}

const unitSchema = z.object({
  id: uuid.optional(),
  company_id: uuid,
  code,
  name: text,
});
export async function saveUnitAction(form: FormData) {
  const actor = await requirePermission("administration.business_units.manage");
  const admin = createSupabaseAdminClient();
  const v = unitSchema.parse(Object.fromEntries(form));
  if (v.id) {
    const { data: old } = await admin
      .from("business_units")
      .select("company_id")
      .eq("id", v.id)
      .single();
    if (old?.company_id !== v.company_id) {
      const { count } = await admin
        .from("payment_requests")
        .select("id", { count: "exact", head: true })
        .eq("business_unit_id", v.id);
      if ((count ?? 0) > 0)
        fail(
          "/admin/business-units",
          "No se puede cambiar la empresa de una unidad con operaciones",
        );
    }
    await admin
      .from("business_units")
      .update({ company_id: v.company_id, code: v.code, name: v.name })
      .eq("id", v.id);
  } else
    await admin
      .from("business_units")
      .insert({ ...v, created_by: actor.user.id });
  revalidatePath("/admin/business-units");
  redirect("/admin/business-units?success=Unidad guardada");
}
export async function toggleUnitAction(form: FormData) {
  await requirePermission("administration.business_units.manage");
  const admin = createSupabaseAdminClient();
  const id = uuid.parse(form.get("id"));
  const active = form.get("active") === "true";
  if (!active && form.get("confirm") !== "true") {
    const [{ count: users }, { count: flows }] = await Promise.all([
      admin
        .from("user_business_units")
        .select("user_id", { count: "exact", head: true })
        .eq("business_unit_id", id),
      admin
        .from("approval_workflows")
        .select("id", { count: "exact", head: true })
        .eq("business_unit_id", id)
        .eq("active", true),
    ]);
    if ((users ?? 0) + (flows ?? 0) > 0)
      fail(
        "/admin/business-units",
        "La unidad tiene usuarios o workflows; confirma la desactivación",
      );
  }
  await admin.from("business_units").update({ active }).eq("id", id);
  revalidatePath("/admin/business-units");
}

export async function toggleWorkflowAction(form: FormData) {
  await requirePermission("administration.approval_rules.manage");
  const admin = createSupabaseAdminClient();
  await admin
    .from("approval_workflows")
    .update({ active: form.get("active") === "true" })
    .eq("id", uuid.parse(form.get("id")));
  revalidatePath("/admin/workflows");
}

const workflowStepSchema = z.object({
  id: uuid.optional(),
  name: text,
  sequence_order: z.number().int().positive(),
  parallel_group: z.number().int().positive(),
  execution_mode: z.enum(["sequential", "parallel"]),
  required_role_id: uuid,
  is_required: z.boolean(),
  allow_higher_role_substitution: z.boolean(),
  require_comment: z.boolean(),
  require_additional_attachment: z.boolean(),
});
const workflowSchema = z.object({
  id: uuid.optional(),
  company_id: uuid,
  business_unit_id: uuid,
  code,
  name: text,
  description: z.string().max(500).optional(),
  correction_policy: z.enum(["restart_all", "resume_current"]),
  valid_from: z.string().date(),
  valid_until: z.string().date().optional(),
  priority_order: z.coerce.number().int().min(0),
  request_type: z
    .enum([
      "supplier_payment",
      "reimbursement",
      "petty_cash",
      "advance",
      "other",
    ])
    .optional(),
  priority: z.enum(["urgent", "normal", "scheduled"]).optional(),
  min_amount: z.coerce.number().int().min(0),
  max_amount: z.coerce.number().int().positive().optional(),
  steps: z.array(workflowStepSchema).min(1),
});
export async function saveWorkflowAction(form: FormData) {
  const actor = await requirePermission("administration.approval_rules.manage");
  const admin = createSupabaseAdminClient();
  let rawSteps: unknown;
  try {
    rawSteps = JSON.parse(String(form.get("steps_json") ?? "[]"));
  } catch {
    fail("/admin/workflows", "Las etapas no tienen un formato válido");
  }
  const source = {
    ...Object.fromEntries(form),
    request_type: String(form.get("request_type") || "") || undefined,
    priority: String(form.get("priority") || "") || undefined,
    valid_until: String(form.get("valid_until") || "") || undefined,
    max_amount: String(form.get("max_amount") || "")
      ? Number(form.get("max_amount"))
      : undefined,
    steps: rawSteps,
  };
  const parsed = workflowSchema.safeParse(source);
  if (!parsed.success) fail("/admin/workflows", parsed.error.issues[0].message);
  const v = parsed.data;
  if (v.max_amount !== undefined && v.min_amount > v.max_amount)
    fail("/admin/workflows", "El monto mínimo no puede superar al máximo");
  const { data: unit } = await admin
    .from("business_units")
    .select("company_id")
    .eq("id", v.business_unit_id)
    .single();
  if (unit?.company_id !== v.company_id)
    fail("/admin/workflows", "La unidad no pertenece a la empresa");
  const { data: candidates } = await admin
    .from("approval_workflows")
    .select(
      "id,approval_workflow_conditions(request_type,priority,min_amount,max_amount)",
    )
    .eq("company_id", v.company_id)
    .eq("business_unit_id", v.business_unit_id)
    .eq("active", true);
  const overlaps = (candidates ?? [])
    .filter((w) => w.id !== v.id)
    .some((w) => {
      const c = Array.isArray(w.approval_workflow_conditions)
        ? w.approval_workflow_conditions[0]
        : w.approval_workflow_conditions;
      if (!c) return false;
      const typeMatch =
        !c.request_type || !v.request_type || c.request_type === v.request_type;
      const priorityMatch =
        !c.priority || !v.priority || c.priority === v.priority;
      const aMax = c.max_amount == null ? Infinity : Number(c.max_amount);
      const bMax = v.max_amount ?? Infinity;
      return (
        typeMatch &&
        priorityMatch &&
        Number(c.min_amount) <= bMax &&
        v.min_amount <= aMax
      );
    });
  if (overlaps)
    fail(
      "/admin/workflows",
      "La configuración se superpone con otro workflow activo",
    );
  let id = v.id;
  const workflowData = {
    company_id: v.company_id,
    business_unit_id: v.business_unit_id,
    code: v.code,
    name: v.name,
    description: v.description || null,
    correction_policy: v.correction_policy,
    valid_from: v.valid_from,
    valid_until: v.valid_until || null,
    priority_order: v.priority_order,
    active: true,
  };
  if (id) {
    await admin.from("approval_workflows").update(workflowData).eq("id", id);
  } else {
    const { data, error } = await admin
      .from("approval_workflows")
      .insert({ ...workflowData, created_by: actor.user.id })
      .select("id")
      .single();
    if (error) fail("/admin/workflows", error.message);
    id = data.id;
  }
  await admin.from("approval_workflow_conditions").upsert(
    {
      company_id: v.company_id,
      workflow_id: id,
      request_type: v.request_type || null,
      priority: v.priority || null,
      min_amount: v.min_amount,
      max_amount: v.max_amount ?? null,
      created_by: actor.user.id,
    },
    { onConflict: "workflow_id" },
  );
  const { data: existing } = await admin
    .from("approval_workflow_steps")
    .select("id")
    .eq("workflow_id", id);
  const retained: string[] = [];
  for (const step of v.steps) {
    if (step.id) {
      retained.push(step.id);
      await admin
        .from("approval_workflow_steps")
        .update({ ...step, active: true })
        .eq("id", step.id)
        .eq("workflow_id", id);
    } else {
      const { data: newStep, error } = await admin
        .from("approval_workflow_steps")
        .insert({
          ...step,
          company_id: v.company_id,
          workflow_id: id,
          created_by: actor.user.id,
        })
        .select("id")
        .single();
      if (error) fail("/admin/workflows", error.message);
      retained.push(newStep.id);
    }
  }
  const removed = (existing ?? [])
    .map((x) => x.id)
    .filter((x) => !retained.includes(x));
  if (removed.length)
    await admin
      .from("approval_workflow_steps")
      .update({ active: false })
      .in("id", removed);
  await audit(
    admin,
    actor.user.id,
    v.id ? "update" : "create",
    "approval_workflows",
    id ?? null,
    null,
    v,
    v.company_id,
  );
  revalidatePath("/admin/workflows");
  redirect("/admin/workflows?success=Workflow guardado");
}
export async function duplicateWorkflowAction(form: FormData) {
  await requirePermission("administration.approval_rules.manage");
  const admin = createSupabaseAdminClient();
  const id = uuid.parse(form.get("id"));
  const { data: w } = await admin
    .from("approval_workflows")
    .select("*,approval_workflow_conditions(*),approval_workflow_steps(*)")
    .eq("id", id)
    .single();
  if (!w) fail("/admin/workflows", "Workflow no encontrado");
  const newCode = `${w.code}-COPY-${Date.now().toString().slice(-5)}`.slice(
    0,
    60,
  );
  const { data: copy, error } = await admin
    .from("approval_workflows")
    .insert({
      company_id: w.company_id,
      business_unit_id: w.business_unit_id,
      code: newCode,
      name: `Copia de ${w.name}`,
      description: w.description,
      correction_policy: w.correction_policy,
      valid_from: w.valid_from,
      valid_until: w.valid_until,
      priority_order: w.priority_order,
      active: false,
      created_by: (
        await requirePermission("administration.approval_rules.manage")
      ).user.id,
    })
    .select("id")
    .single();
  if (error) fail("/admin/workflows", error.message);
  const c = Array.isArray(w.approval_workflow_conditions)
    ? w.approval_workflow_conditions[0]
    : w.approval_workflow_conditions;
  if (c)
    await admin.from("approval_workflow_conditions").insert({
      company_id: w.company_id,
      workflow_id: copy.id,
      request_type: c.request_type,
      min_amount: c.min_amount,
      max_amount: c.max_amount,
      priority: c.priority,
    });
  if (w.approval_workflow_steps?.length)
    await admin.from("approval_workflow_steps").insert(
      w.approval_workflow_steps.map((s: Record<string, unknown>) => ({
        company_id: w.company_id,
        workflow_id: copy.id,
        name: s.name,
        sequence_order: s.sequence_order,
        parallel_group: s.parallel_group,
        execution_mode: s.execution_mode,
        required_role_id: s.required_role_id,
        is_required: s.is_required,
        allow_higher_role_substitution: s.allow_higher_role_substitution,
        require_comment: s.require_comment,
        require_additional_attachment: s.require_additional_attachment,
        active: true,
      })),
    );
  revalidatePath("/admin/workflows");
  redirect("/admin/workflows?success=Workflow duplicado como inactivo");
}

export async function bootstrapSuperadminAction(form: FormData) {
  const admin = createSupabaseAdminClient();
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) fail("/login", "El sistema ya fue inicializado");
  const target = email.parse(form.get("email"));
  const password = z.string().min(12).parse(form.get("password"));
  const [{ data: role }, { data: company }, { data: units }] =
    await Promise.all([
      admin.from("roles").select("id").eq("key", "superadmin").single(),
      admin.from("companies").select("id").eq("code", "OASIS").single(),
      admin.from("business_units").select("id,company_id").eq("active", true),
    ]);
  if (!role || !company || !units?.length)
    fail("/setup", "Faltan datos iniciales");
  const { data, error } = await admin.auth.admin.createUser({
    email: target,
    password,
    email_confirm: true,
  });
  if (error || !data.user) fail("/setup", error?.message ?? "No se pudo crear");
  const id = data.user.id;
  try {
    const second = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if ((second.count ?? 0) > 0)
      throw new Error("El sistema fue inicializado simultáneamente");
    const p = await admin.from("profiles").insert({
      id,
      role_id: role.id,
      first_name: text.parse(form.get("first_name")),
      last_name: text.parse(form.get("last_name")),
      email: target,
      job_title: "Superadministrador",
      created_by: id,
    });
    if (p.error) throw p.error;
    const c = await admin
      .from("user_companies")
      .insert({ user_id: id, company_id: company.id, created_by: id });
    if (c.error) throw c.error;
    const u = await admin.from("user_business_units").insert(
      units.map((x) => ({
        user_id: id,
        company_id: x.company_id,
        business_unit_id: x.id,
        created_by: id,
      })),
    );
    if (u.error) throw u.error;
  } catch (e) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
    fail("/setup", `Inicialización revertida: ${(e as Error).message}`);
  }
  redirect("/login?created=1");
}
