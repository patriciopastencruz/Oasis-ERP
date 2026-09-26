import "server-only";
import { Resend } from "resend";
import { clp, formatClosingDate, pct, type DailyClosing } from "../domain/daily-closing";

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderClosingEmail(unitName: string, closing: DailyClosing) {
  const rows: [string, string][] = [
    ["Habitaciones ocupadas", `${closing.occupied_rooms} de ${closing.total_rooms} (${pct(closing.occupancy_pct)})`],
    ["Monto total recibido", clp(closing.total_received)],
    ["Gasto total", clp(closing.expense_total)],
    ["Resultado del día", clp(closing.net_result)],
    ["Monto pendiente", clp(closing.pending_amount)],
  ];
  const notes = [
    ["Problemas reportados", closing.reported_problems],
    ["Elementos que deben reponerse", closing.items_to_replenish],
    ["Observaciones generales", closing.observations],
  ].filter(([, value]) => value) as [string, string][];
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937;background:#f2f6fb;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d9dfe6">
<div style="background:#173f87;color:#fff;padding:18px 24px"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">${escape(unitName)}</div>
<div style="font-size:20px;font-weight:bold;margin-top:4px">Cierre diario ${formatClosingDate(closing.closing_date)}</div></div>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 24px;border-bottom:1px solid #eef2f6">${label}</td><td style="padding:8px 24px;border-bottom:1px solid #eef2f6;text-align:right;font-weight:bold">${value}</td></tr>`,
    )
    .join("")}</table>
${notes.map(([label, value]) => `<p style="padding:0 24px;font-size:13px"><b>${label}:</b><br>${escape(value).replace(/\n/g, "<br>")}</p>`).join("")}
<p style="padding:0 24px 20px;font-size:12px;color:#64748b">El reporte completo va adjunto en PDF. Enviado automáticamente por OASIS ERP.</p>
</div></body></html>`;
}

export async function sendClosingEmail({
  to,
  subject,
  html,
  pdf,
  filename,
}: {
  to: string[];
  subject: string;
  html: string;
  pdf: Uint8Array;
  filename: string;
}) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) {
    console.warn("[lodging-closing] Correo no enviado: configura RESEND_API_KEY y RESEND_FROM_EMAIL.");
    return { configured: false, sent: false };
  }
  if (!to.length) return { configured: true, sent: false };
  const { error } = await new Resend(key).emails.send({
    from,
    to,
    subject,
    html,
    attachments: [{ filename, content: Buffer.from(pdf) }],
  });
  if (error) {
    console.error("[lodging-closing] Error al enviar el correo", error);
    return { configured: true, sent: false };
  }
  return { configured: true, sent: true };
}
