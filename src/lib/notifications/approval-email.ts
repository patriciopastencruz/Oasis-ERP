import "server-only";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  approvalActionUrl,
  renderApprovalEmail,
} from "./approval-email-template";

type OutboxRow = {
  id: string;
  notification_id: string;
  recipient_id: string;
  recipient_email: string;
  event_key: string;
  subject: string;
  body: string;
  entity_type: string;
  entity_id: string;
  attempts: number;
};

let resendClient: Resend | null = null;

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  resendClient ??= new Resend(key);
  return resendClient;
}

async function deliverApprovalEmails(batchSize: number) {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from) {
    console.warn(
      "[approval-email] Envío pendiente: configura RESEND_API_KEY y RESEND_FROM_EMAIL.",
    );
    return { configured: false, sent: 0, failed: 0 };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("claim_approval_email_outbox", {
    batch_size: Math.min(Math.max(batchSize, 1), 100),
  });
  if (error) {
    console.error("[approval-email] No fue posible reclamar la cola", error);
    return { configured: true, sent: 0, failed: 0 };
  }

  const rows = (data ?? []) as OutboxRow[];
  let sent = 0;
  let failed = 0;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://oasis-erp.vercel.app";

  for (const row of rows) {
    try {
      const { data: profile } = await admin
        .from("profiles")
        .select("first_name,last_name")
        .eq("id", row.recipient_id)
        .maybeSingle();
      const recipientName = profile
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : null;
      const actionUrl = approvalActionUrl(
        appUrl,
        row.entity_type,
        row.entity_id,
        row.event_key,
      );
      const result = await resend.emails.send(
        {
          from,
          to: row.recipient_email,
          subject: `[OASIS ERP] ${row.subject}`,
          html: renderApprovalEmail({
            subject: row.subject,
            body: row.body,
            recipientName,
            actionUrl,
          }),
        },
        { idempotencyKey: `approval/${row.notification_id}` },
      );
      if (result.error || !result.data?.id)
        throw new Error(result.error?.message ?? "Resend no devolvió un ID");
      const update = await admin
        .from("approval_email_outbox")
        .update({
          status: "sent",
          provider_message_id: result.data.id,
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", row.id)
        .eq("status", "sending");
      if (update.error) throw update.error;
      sent += 1;
    } catch (sendError) {
      failed += 1;
      const message =
        sendError instanceof Error ? sendError.message : String(sendError);
      const retryMinutes = Math.min(60, Math.max(5, 2 ** row.attempts * 5));
      await admin
        .from("approval_email_outbox")
        .update({
          status: "failed",
          last_error: message.slice(0, 2000),
          next_attempt_at: new Date(
            Date.now() + retryMinutes * 60_000,
          ).toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "sending");
      console.error("[approval-email] Envío fallido", row.id, message);
    }
  }

  return { configured: true, sent, failed };
}

/**
 * El correo es un efecto secundario: una caída del proveedor nunca revierte ni
 * oculta una solicitud que ya quedó registrada para aprobación.
 */
export async function dispatchApprovalEmails(batchSize = 25) {
  try {
    return await deliverApprovalEmails(batchSize);
  } catch (error) {
    console.error("[approval-email] Error no bloqueante", error);
    return { configured: Boolean(getResend()), sent: 0, failed: 0 };
  }
}
