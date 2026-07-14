export type ApprovalEmailTemplateInput = {
  subject: string;
  body: string;
  recipientName?: string | null;
  actionUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function notificationActionPath(
  entityType: string,
  entityId: string,
  eventKey?: string,
) {
  switch (entityType) {
    case "payment_request":
      return eventKey && eventKey !== "payment_request.approval_assigned"
        ? `/finance/payment-control/requests/${entityId}`
        : `/finance/payment-control/approvals/${entityId}`;
    case "petty_cash_report":
      return eventKey && eventKey !== "petty_cash.review_assigned"
        ? `/finance/petty-cash/reports/${entityId}`
        : `/finance/petty-cash/reviews/${entityId}`;
    case "inventory_change_request":
      return "/inventory/approvals";
    case "dist_change_request":
      return "/finance/distribution/requests";
    default:
      return "/notifications";
  }
}

export function approvalActionUrl(
  appUrl: string,
  entityType: string,
  entityId: string,
  eventKey?: string,
) {
  return `${appUrl.replace(/\/$/, "")}${notificationActionPath(entityType, entityId, eventKey)}`;
}

export function renderApprovalEmail(input: ApprovalEmailTemplateInput) {
  const subject = escapeHtml(input.subject);
  const body = escapeHtml(input.body);
  const recipient = input.recipientName
    ? `<p style="margin:0 0 16px;color:#334139">Hola ${escapeHtml(input.recipientName)},</p>`
    : "";
  const url = escapeHtml(input.actionUrl);
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#eef3f0;font-family:Arial,sans-serif;color:#173126">
    <div style="display:none;max-height:0;overflow:hidden">${subject}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f0;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #d8e3dc;border-radius:18px">
          <tr><td style="padding:28px 32px 12px">
            <p style="margin:0;color:#277a55;font-size:12px;font-weight:700;letter-spacing:2px">OASIS ERP</p>
            <h1 style="margin:14px 0 0;font-size:24px;line-height:1.3">${subject}</h1>
          </td></tr>
          <tr><td style="padding:12px 32px 30px">
            ${recipient}
            <p style="margin:0 0 24px;color:#526159;font-size:15px;line-height:1.6">${body}</p>
            <a href="${url}" style="display:inline-block;border-radius:10px;background:#176b46;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 18px">Revisar solicitud</a>
            <p style="margin:26px 0 0;color:#7a8981;font-size:12px;line-height:1.5">Este correo fue generado automáticamente. La autorización debe realizarse dentro de OASIS ERP.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
