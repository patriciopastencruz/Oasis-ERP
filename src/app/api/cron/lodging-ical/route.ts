import { timingSafeEqual } from "node:crypto";
import { synchronizeUnit } from "@/modules/lodging/application/actions";
function valid(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const value =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function GET(request: Request) {
  if (!valid(request))
    return Response.json({ error: "No autorizado" }, { status: 401 });
  await synchronizeUnit();
  return Response.json({ ok: true });
}
