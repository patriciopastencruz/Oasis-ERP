import { timingSafeEqual } from "node:crypto";
import { dispatchApprovalEmails } from "@/lib/notifications/approval-email";

function valid(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const value =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Respaldo del envío "en línea" que hacen las acciones de cada módulo
// (finance, inventory, lodging, etc.) justo antes de un redirect: en
// Vercel esa llamada puede no alcanzar a completarse si la función
// serverless se corta apenas se envía la respuesta. Este cron reintenta
// cualquier correo que haya quedado pendiente/fallido en la cola,
// respetando el backoff que ya maneja claim_approval_email_outbox.
export async function GET(request: Request) {
  if (!valid(request))
    return Response.json({ error: "No autorizado" }, { status: 401 });
  const result = await dispatchApprovalEmails(100);
  return Response.json({ ok: true, ...result });
}
