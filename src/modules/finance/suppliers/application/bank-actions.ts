"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isChileanBank } from "@/modules/finance/suppliers/domain/chilean-banks";
import {
  requirePermission,
  requireSession,
} from "@/modules/platform/auth/application/session";
export type BankResult = { success: boolean; message?: string; data?: unknown };
const accountTypes = ["checking", "sight", "savings", "rut", "other"] as const;
const schema = z.object({
  supplier_id: z.string().uuid(),
  bank_name: z
    .string()
    .trim()
    .refine(isChileanBank, "Selecciona un banco válido."),
  account_type: z.enum(accountTypes),
  account_number: z.string().trim().min(3).max(80),
  account_holder_name: z.string().trim().min(2).max(180),
  account_holder_rut: z.string().trim().min(8).max(15),
  receipt_email: z.union([z.string().trim().email(), z.literal("")]),
  active: z.string().optional(),
});
export async function saveSupplierBankAccountAction(
  _p: BankResult,
  form: FormData,
): Promise<BankResult> {
  try {
    await requirePermission("finance.supplier_bank_accounts.manage");
    const v = schema.safeParse(Object.fromEntries(form));
    if (!v.success)
      return { success: false, message: v.error.issues[0].message };
    const s = await createSupabaseServerClient();
    const { data, error } = await s.rpc("save_supplier_bank_account", {
      target_supplier: v.data.supplier_id,
      target_bank: v.data.bank_name,
      target_type: v.data.account_type,
      target_number: v.data.account_number,
      target_holder: v.data.account_holder_name,
      target_holder_rut: v.data.account_holder_rut,
      target_email: v.data.receipt_email || null,
      target_active: v.data.active === "on",
    });
    if (error) {
      console.error("[bank-save]", error.message);
      return {
        success: false,
        message: /RUT/i.test(error.message)
          ? "El RUT del titular no es válido."
          : "No fue posible guardar la cuenta bancaria.",
      };
    }
    revalidatePath(`/finance/payment-control/suppliers/${v.data.supplier_id}`);
    revalidatePath(`/suppliers/${v.data.supplier_id}`);
    return {
      success: true,
      message: "Cuenta bancaria guardada correctamente.",
      data,
    };
  } catch {
    return {
      success: false,
      message: "Permiso insuficiente o sesión expirada.",
    };
  }
}
export async function supplierBankSummaryAction(
  supplierId: string,
): Promise<BankResult> {
  try {
    await requireSession();
    const s = await createSupabaseServerClient();
    const { data, error } = await s.rpc("supplier_bank_account_summary", {
      target_supplier: supplierId,
    });
    if (error) throw error;
    return { success: true, data };
  } catch {
    return {
      success: false,
      message: "No fue posible consultar la cuenta bancaria.",
    };
  }
}
